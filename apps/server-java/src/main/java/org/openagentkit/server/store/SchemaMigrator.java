package org.openagentkit.server.store;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.store.KitDatabase.Dialect;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.io.IOException;
import java.io.InputStream;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

final class SchemaMigrator {
    static final class Failure extends RuntimeException {
        Failure(String message) { super(message); }
    }

    private final Connection connection;
    private final JdbcTemplate sql;
    private final Dialect dialect;
    private final SchemaCatalog catalog;
    private final MigrationData data;
    private final JsonNode program;
    private final JsonNode resources;

    SchemaMigrator(Connection connection, Dialect dialect, KitJson json) throws IOException {
        this.connection = connection;
        this.dialect = dialect;
        this.sql = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
        this.catalog = new SchemaCatalog(connection, sql, dialect);
        this.data = new MigrationData(sql, catalog, dialect, json);
        try (InputStream input = SchemaMigrator.class.getResourceAsStream("/kit/migrations.json")) {
            this.resources = json.mapper.readTree(input);
        }
        this.program = resources.required(dialect.name().toLowerCase(java.util.Locale.ROOT));
    }

    void migrate() throws SQLException {
        switch (dialect) {
            case SQLITE:
                initializeLedger("TEXT", "TEXT", "");
                for (JsonNode version : pending(null)) {
                    boolean rebuild = version.path("sqliteRebuild").asBoolean();
                    if (rebuild) sql.execute("PRAGMA foreign_keys = OFF");
                    try {
                        tx(() -> {
                            applyVersion(version);
                            if (rebuild && !rows("PRAGMA foreign_key_check").isEmpty()) {
                                throw new Failure("SQLite 重建后有外键冲突");
                            }
                        });
                    } finally {
                        if (rebuild) sql.execute("PRAGMA foreign_keys = ON");
                    }
                }
                checkCurrent();
                break;
            case POSTGRES:
                tx(() -> {
                    sql.execute("SET LOCAL lock_timeout = '15s'");
                    rows("SELECT pg_advisory_xact_lock(hashtext('openagentpack.kit.schema')::bigint)");
                    initializeLedger("TEXT", "TEXT", "");
                    pending(null).forEach(this::applyVersion);
                    checkCurrent();
                });
                break;
            case MYSQL:
                migrateMysql();
                break;
        }
    }

    private void initializeLedger(String idType, String dateType, String suffix) {
        sql.execute("CREATE TABLE IF NOT EXISTS _kit_migrations (id " + idType +
            " PRIMARY KEY, applied_at " + dateType + " NOT NULL)" + suffix);
    }

    private void migrateMysql() throws SQLException {
        String lock = rows("SELECT CONCAT('kit-schema:', LEFT(SHA2(DATABASE(), 256), 48)) AS lock_name")
            .get(0).text("lock_name");
        if (!rows("SELECT GET_LOCK(?, 15) AS acquired", lock).get(0).yes("acquired")) {
            throw new Failure("无法取得 MySQL 迁移锁");
        }
        try {
            String attributes = " " + resources.required("mysqlTableOptions").asText();
            initializeLedger("VARCHAR(100)", "VARCHAR(32)", attributes);
            sql.execute("CREATE TABLE IF NOT EXISTS _kit_migration_progress (" +
                "slot INT PRIMARY KEY CHECK (slot = 1), id VARCHAR(100) NOT NULL, step_index INT NOT NULL, " +
                "inflight TINYINT NOT NULL, fingerprint VARCHAR(64) NOT NULL)" + attributes);
            List<Row> progressRows = rows("SELECT * FROM _kit_migration_progress WHERE slot = 1");
            Row progress = progressRows.isEmpty() ? null : progressRows.get(0);
            List<JsonNode> pending = pending(progress);
            for (int index = 0; index < pending.size(); index++) {
                applyMysqlVersion(pending.get(index), index == 0 ? progress : null);
            }
            checkCurrent();
        } finally {
            rows("SELECT RELEASE_LOCK(?)", lock);
        }
    }

    private List<JsonNode> pending(Row progress) {
        Set<String> applied = rows("SELECT id FROM _kit_migrations").stream().map(row -> row.text("id"))
            .collect(Collectors.toSet());
        String oldId = "001_initial_" + (dialect == Dialect.MYSQL ? "mysql" : "postgres") + "_schema";
        boolean legacy = dialect != Dialect.SQLITE && applied.contains(oldId);
        List<JsonNode> versions = new ArrayList<>();
        if (legacy) versions.add(program.required("adoption"));
        else program.required("history").forEach(versions::add);
        program.required("upgrades").forEach(versions::add);

        Set<String> known = versions.stream().map(version -> version.path("id").asText()).collect(Collectors.toSet());
        for (String id : applied) {
            // 旧 SQLite 分支对同一列使用过较早的版本 ID，冻结的迁移有幂等守卫。
            if (!known.contains(id) && !(legacy && oldId.equals(id)) && !oldSqliteId(id)) {
                throw new Failure("迁移记录包含未知版本 " + id);
            }
        }
        List<JsonNode> pending = new ArrayList<>();
        Map<String, JsonNode> expected = new LinkedHashMap<>();
        if (legacy) program.required("legacy").forEach(table -> expected.put(table.path("name").asText(), table));
        for (JsonNode version : versions) {
            String id = version.path("id").asText();
            if (!applied.contains(id)) {
                pending.add(version);
            } else {
                if (!pending.isEmpty() && dialect != Dialect.SQLITE) throw new Failure("迁移记录不连续");
                version.path("steps").forEach(step -> step.path("changes").forEach(change -> {
                    String name = change.path("name").asText();
                    if (change.path("after").isNull()) expected.remove(name);
                    else expected.put(name, change.path("after"));
                }));
            }
        }
        if (progress != null && (pending.isEmpty() || !pending.get(0).path("id").asText().equals(progress.text("id")))) {
            throw new Failure("MySQL 待恢复版本与迁移记录不匹配");
        }
        if (dialect != Dialect.SQLITE && progress == null && !pending.isEmpty()) {
            catalog.check(expected);
        }
        return pending;
    }

    private boolean oldSqliteId(String id) {
        return dialect == Dialect.SQLITE && id.matches("0(?:[01]\\d|2\\d|3[012])_[a-z0-9_]+");
    }

    private void applyVersion(JsonNode version) {
        int index = 0;
        for (JsonNode step : version.required("steps")) {
            if (step.has("sql")) ddl(version, index, step, false, () -> {});
            else data.apply(step);
            index++;
        }
        record(version.path("id").asText());
    }

    private void applyMysqlVersion(JsonNode version, Row progress) throws SQLException {
        String id = version.path("id").asText();
        JsonNode steps = version.required("steps");
        String fingerprint = resources.required("mysqlFingerprints").required(id).asText();
        int start = progress == null ? 0 : Math.toIntExact(progress.integer("step_index"));
        if (progress != null && (!fingerprint.equals(progress.text("fingerprint")) || start < 0 || start > steps.size())) {
            throw new Failure("MySQL 待恢复迁移指纹或序号无效 " + id);
        }
        if (progress == null) sql.update(
            "INSERT INTO _kit_migration_progress (slot, id, step_index, inflight, fingerprint) VALUES (1, ?, 0, 0, ?)",
            id, fingerprint);
        for (int index = start; index < steps.size(); index++) {
            JsonNode step = steps.get(index);
            int position = index;
            if (step.has("sql")) {
                ddl(version, index, step, progress != null && index == start && progress.yes("inflight"),
                    () -> advance(position, true));
                advance(index + 1, false);
            } else {
                tx(() -> {
                    data.apply(step);
                    advance(position + 1, false);
                });
            }
        }
        tx(() -> {
            record(id);
            sql.update("DELETE FROM _kit_migration_progress WHERE slot = 1");
        });
    }

    private void ddl(JsonNode version, int index, JsonNode step, boolean inflight, Runnable begin) {
        JsonNode changes = step.required("changes");
        String after = catalog.mismatch(changes, "after");
        if (after == null && (inflight || (index == 0 && version.path("id").asText().equals("kit_history_adopted")))) return;
        String stage = version.path("id").asText() + " 第 " + (index + 1) + " 步";
        String before = catalog.mismatch(changes, "before");
        if (before != null) throw new Failure(stage + " 的迁移前结构不符（" + before + "）");
        begin.run();
        try {
            sql.execute(step.path("sql").asText());
        } catch (RuntimeException error) {
            throw new Failure(stage + " 执行失败");
        }
        after = catalog.mismatch(changes, "after");
        if (after != null) throw new Failure(stage + " 的迁移后结构不符（" + after + "）");
    }

    private void advance(int step, boolean inflight) {
        sql.update("UPDATE _kit_migration_progress SET step_index=?, inflight=? WHERE slot=1", step, inflight ? 1 : 0);
    }

    private void record(String id) {
        sql.update("INSERT INTO _kit_migrations (id, applied_at) VALUES (?, ?)", id, KitJson.now());
    }

    private void checkCurrent() {
        Map<String, JsonNode> tables = new LinkedHashMap<>();
        program.required("current").forEach(table -> tables.put(table.path("name").asText(), table));
        catalog.check(tables);
    }

    private List<Row> rows(String query, Object... args) {
        return KitDatabase.query(sql, query, args);
    }

    private void tx(Runnable task) throws SQLException {
        connection.setAutoCommit(false);
        try {
            task.run();
            connection.commit();
        } catch (RuntimeException | SQLException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(true);
        }
    }
}
