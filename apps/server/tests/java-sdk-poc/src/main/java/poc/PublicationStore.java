package poc;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Component
final class PublicationStore {
    private final Connection db;
    private final ObjectMapper json;

    PublicationStore(Environment environment, ObjectMapper json) throws SQLException {
        this.json = json;
        db = DriverManager.getConnection("jdbc:sqlite:" + environment.getRequiredProperty("POC_DB_PATH"));
        try (Statement statement = db.createStatement()) {
            statement.execute("PRAGMA journal_mode = WAL");
            statement.execute("PRAGMA foreign_keys = ON");
            statement.execute("PRAGMA busy_timeout = 3000");
            statement.execute("CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, expected TEXT NOT NULL,"
                + " expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0)");
            statement.execute("CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, plan_id TEXT UNIQUE NOT NULL"
                + " REFERENCES plans(id), status TEXT NOT NULL, instance_id TEXT, publication TEXT, bindings TEXT,"
                + " error_details TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
            statement.execute("CREATE TABLE IF NOT EXISTS checkpoints (operation_id TEXT NOT NULL REFERENCES operations(id),"
                + " seq INTEGER NOT NULL, sdk_state_json TEXT NOT NULL, PRIMARY KEY(operation_id, seq))");
        }
    }

    synchronized void savePlan(Plan plan) {
        requirePublishable();
        update("INSERT INTO plans (id, expected, expires) VALUES (?, ?, ?)",
            plan.id, plan.expected.toString(), plan.expires);
    }

    synchronized void requirePublishable() {
        String action = recoveryAction();
        if (!"replan".equals(action)) throw PocFailure.conflict("批次需要先核对原发布结果");
    }

    synchronized String recoveryAction() {
        Operation op = query("SELECT * FROM operations ORDER BY rowid DESC LIMIT 1", this::operation);
        if (op == null) return "replan";
        if ("succeeded".equals(op.status)) return "none";
        if ("failed".equals(op.status) && op.publication != null && !op.publication.path("mutation_started").asBoolean())
            return "replan";
        return "read_result";
    }

    synchronized Plan getPlan(String id) {
        return query("SELECT * FROM plans WHERE id = ?", row -> new Plan(row.getString("id"),
            parse(row.getString("expected")), row.getLong("expires"), row.getInt("consumed") == 1), id);
    }

    // 令牌消费和 Operation 创建共用一笔 SQLite 事务。
    synchronized String accept(Plan plan) {
        try {
            db.setAutoCommit(false);
            try {
                if (update("UPDATE plans SET consumed = 1 WHERE id = ? AND consumed = 0 AND expires > ?",
                    plan.id, System.currentTimeMillis()) != 1) throw confirmationRequired();
                requirePublishable();
                String id = UUID.randomUUID().toString();
                String now = Instant.now().toString();
                update("INSERT INTO operations (id, plan_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)",
                    id, plan.id, now, now);
                db.commit();
                return id;
            } catch (SQLException | RuntimeException error) {
                db.rollback();
                throw error;
            } finally {
                db.setAutoCommit(true);
            }
        } catch (SQLException error) {
            throw databaseFailure(error);
        }
    }

    synchronized Operation get(String id) {
        Operation op = query("SELECT * FROM operations WHERE id = ?", this::operation, id);
        if (op == null) throw PocFailure.notFound();
        return op;
    }

    synchronized void claim(String id, String instance) {
        if (update("UPDATE operations SET instance_id = ?, status = 'running', updated_at = ?"
                + " WHERE id = ? AND status = 'pending'", instance, Instant.now().toString(), id) != 1)
            throw PocFailure.conflict("发布已领取或结束");
    }

    synchronized void checkpoint(String id, String instance, int seq, String state) {
        Operation op = get(id);
        requireOwner(op, instance);
        String existing = query("SELECT sdk_state_json FROM checkpoints WHERE operation_id = ? AND seq = ?",
            row -> row.getString(1), id, seq);
        if (existing != null) {
            if (!existing.equals(state)) throw PocFailure.conflict("检查点内容不一致");
            return;
        }
        requireRunning(op);
        if (seq != checkpointSequence(id) + 1) throw PocFailure.conflict("检查点顺序无效");
        if (state == null || !parse(state).path("resources").isArray()) throw PocFailure.invalid();
        update("INSERT INTO checkpoints (operation_id, seq, sdk_state_json) VALUES (?, ?, ?)", id, seq, state);
    }

    synchronized void finish(String id, String instance, JsonNode result) {
        Operation op = get(id);
        requireOwner(op, instance);
        requireRunning(op);
        JsonNode report = result.path("publication");
        String outcome = report.path("outcome").asText();
        if (!report.path("resources").isArray() || !report.path("mutation_started").isBoolean())
            throw PocFailure.invalid();
        if ("succeeded".equals(outcome)) {
            JsonNode bindings = result.path("bindings");
            if (!hasCompleteBindings(id, bindings))
                throw PocFailure.conflict("成功结果缺少完整检查点和资源绑定");
            finish(id, "succeeded", report, bindings, null);
        } else if ("failed".equals(outcome) || "partial".equals(outcome) || "unknown".equals(outcome)) {
            finish(id, "failed", report, null, result.path("error_details"));
        } else {
            throw PocFailure.invalid();
        }
    }

    private boolean hasCompleteBindings(String id, JsonNode bindings) {
        Map<String, String> actual = new HashMap<>();
        for (JsonNode item : state(id).path("resources")) {
            actual.put(item.path("address").path("type").asText() + ":" + item.path("address").path("name").asText(),
                item.path("remote_id").asText());
        }
        if (!bindings.isArray() || bindings.size() != 2 || actual.size() != 2) return false;
        for (JsonNode binding : bindings) {
            String type = binding.path("type").asText();
            String remoteId = binding.path("remote_id").asText();
            String savedId = actual.remove(type + ":" + binding.path("id").asText());
            if (remoteId.isBlank() || !remoteId.equals(savedId)) return false;
            if ("agent".equals(type) && binding.path("version").asInt() <= 0) return false;
        }
        return actual.isEmpty();
    }

    synchronized void failIfUnclaimed(String id) {
        if (!"pending".equals(get(id).status)) return;
        finish(id, "failed", report("failed", false), null, details("publication.dispatch_failed", "prepare", false));
    }

    synchronized Operation observeReplacement(String id, String currentInstance) {
        Operation op = get(id);
        if (!"running".equals(op.status) || currentInstance.isBlank() || currentInstance.equals(op.instanceId)) return op;
        ObjectNode report = report("unknown", true);
        ArrayNode resources = (ArrayNode) report.get("resources");
        for (JsonNode row : state(id).path("resources")) {
            ObjectNode resource = resources.addObject()
                .put("type", row.path("address").path("type").asText())
                .put("id", row.path("address").path("name").asText())
                .put("status", "succeeded").put("remote_id", row.path("remote_id").asText());
            if (row.path("version").isIntegralNumber()) resource.set("version", row.get("version"));
        }
        finish(id, "failed", report, null, details("publication.interrupted", "interrupted", true));
        return get(id);
    }

    private void finish(String id, String status, JsonNode report, JsonNode bindings, JsonNode details) {
        update("UPDATE operations SET status = ?, publication = ?, bindings = ?, error_details = ?, updated_at = ?"
                + " WHERE id = ?", status, report.toString(), serialized(bindings), serialized(details),
            Instant.now().toString(), id);
    }

    private static String serialized(JsonNode value) {
        return value == null || value.isMissingNode() ? null : value.toString();
    }

    private ObjectNode report(String outcome, boolean started) {
        ObjectNode report = json.createObjectNode().put("outcome", outcome).put("mutation_started", started);
        report.putArray("resources");
        return report;
    }

    private ObjectNode details(String code, String phase, boolean started) {
        return json.createObjectNode().put("code", code).put("phase", phase)
            .put("mutation_started", started).put("retryable", false);
    }

    private static void requireOwner(Operation op, String instance) {
        if (op.instanceId == null || !op.instanceId.equals(instance)) throw PocFailure.conflict("执行实例不匹配");
    }

    private static void requireRunning(Operation op) {
        if (!"running".equals(op.status)) throw PocFailure.conflict("发布执行已经结束");
    }

    private int checkpointSequence(String id) {
        return query("SELECT COALESCE(MAX(seq), 0) FROM checkpoints WHERE operation_id = ?",
            row -> row.getInt(1), id);
    }

    private JsonNode state(String id) {
        String value = query("SELECT sdk_state_json FROM checkpoints WHERE operation_id = ? ORDER BY seq DESC LIMIT 1",
            row -> row.getString(1), id);
        return value == null ? json.createObjectNode().set("resources", json.createArrayNode()) : parse(value);
    }

    private Operation operation(ResultSet row) throws SQLException {
        return new Operation(row.getString("id"), row.getString("status"), row.getString("instance_id"),
            parse(row.getString("publication")), parse(row.getString("bindings")), parse(row.getString("error_details")),
            row.getString("created_at"), row.getString("updated_at"));
    }

    private JsonNode parse(String value) {
        if (value == null) return null;
        try {
            JsonNode parsed = json.readTree(value);
            if (parsed == null) throw PocFailure.invalid();
            return parsed;
        } catch (JsonProcessingException error) {
            throw PocFailure.invalid();
        }
    }

    private int update(String sql, Object... parameters) {
        try (PreparedStatement statement = prepare(sql, parameters)) {
            return statement.executeUpdate();
        } catch (SQLException error) {
            throw databaseFailure(error);
        }
    }

    private <T> T query(String sql, ReadRow<T> read, Object... parameters) {
        try (PreparedStatement statement = prepare(sql, parameters); ResultSet rows = statement.executeQuery()) {
            return rows.next() ? read.get(rows) : null;
        } catch (SQLException error) {
            throw databaseFailure(error);
        }
    }

    private PreparedStatement prepare(String sql, Object[] parameters) throws SQLException {
        PreparedStatement statement = db.prepareStatement(sql);
        for (int i = 0; i < parameters.length; i++) statement.setObject(i + 1, parameters[i]);
        return statement;
    }

    private static IllegalStateException databaseFailure(SQLException error) {
        return new IllegalStateException("PoC 执行记录写入或读取失败", error);
    }

    static PocFailure confirmationRequired() {
        return new PocFailure(428, "confirmation_required", "发布需要有效且未消费的确认令牌");
    }

    @PreDestroy
    synchronized void close() throws SQLException {
        db.close();
    }

    private interface ReadRow<T> {
        T get(ResultSet row) throws SQLException;
    }

    static final class Plan {
        final String id;
        final JsonNode expected;
        final long expires;
        final boolean consumed;

        Plan(String id, JsonNode expected, long expires, boolean consumed) {
            this.id = id;
            this.expected = expected;
            this.expires = expires;
            this.consumed = consumed;
        }
    }

    static final class Operation {
        final String id;
        final String status;
        final String instanceId;
        final JsonNode publication;
        final JsonNode bindings;
        final JsonNode details;
        final String created;
        final String updated;

        Operation(String id, String status, String instanceId, JsonNode publication, JsonNode bindings,
                  JsonNode details, String created, String updated) {
            this.id = id;
            this.status = status;
            this.instanceId = instanceId;
            this.publication = publication;
            this.bindings = bindings;
            this.details = details;
            this.created = created;
            this.updated = updated;
        }
    }
}
