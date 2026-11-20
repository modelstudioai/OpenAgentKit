package org.openagentkit.server.store;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.store.KitDatabase.Dialect;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SchemaCatalog {
    private static final Pattern MYSQL_HEX = Pattern.compile("convert\\(0x([a-f0-9]+) using utf8mb4\\)", Pattern.CASE_INSENSITIVE);
    private final Connection connection;
    private final JdbcTemplate sql;
    private final Dialect dialect;

    SchemaCatalog(Connection connection, JdbcTemplate sql, Dialect dialect) {
        this.connection = connection;
        this.sql = sql;
        this.dialect = dialect;
    }

    void check(Map<String, JsonNode> expected) {
        for (Map.Entry<String, JsonNode> table : expected.entrySet()) {
            String difference = difference(table.getKey(), table.getValue());
            if (difference != null) {
                throw new SchemaMigrator.Failure(table.getKey() + " 的 " + difference + " 与预期结构不符");
            }
        }
        if (dialect == Dialect.SQLITE) return;
        for (Row table : tables()) {
            String name = table.text("name");
            if (name.equals("_kit_migrations") || name.equals("_kit_migration_progress")) continue;
            if ((expected.isEmpty() || name.matches("kit_.*|quota_.*|catalog_agents|usage_turns"))
                && !expected.containsKey(name)) {
                throw new SchemaMigrator.Failure("数据库含有未登记的 Kit 表 " + name);
            }
        }
    }

    String mismatch(JsonNode changes, String phase) {
        for (JsonNode change : changes) {
            String table = change.path("name").asText();
            String detail = difference(table, change.required(phase));
            if (detail != null) return table + " 的 " + detail;
        }
        return null;
    }

    boolean exists(String table) {
        return !columns(table).isEmpty();
    }

    boolean hasColumn(String table, String column) {
        return columns(table).stream().anyMatch(row -> column.equals(row.text("name")));
    }

    private String difference(String table, JsonNode expected) {
        List<Row> found = columns(table);
        if (expected.isNull()) return found.isEmpty() ? null : "表存在状态";
        Map<String, Row> indexed = new HashMap<>();
        found.forEach(row -> indexed.put(row.text("name"), row));
        if (indexed.size() != expected.path("columns").size()) return "列集合";
        if (dialect == Dialect.MYSQL && found.stream().anyMatch(row -> !"InnoDB".equals(row.text("engine"))
            || !"utf8mb4_0900_bin".equals(row.text("table_collation")))) return "存储引擎或排序规则";
        for (JsonNode column : expected.path("columns")) {
            String name = column.path("name").asText();
            Row row = indexed.get(name);
            if (!sameColumn(column, row)) return "列 " + name;
        }
        try {
            if (!primary(table, found).equals(strings(expected.path("primary")))) return "主键";
            Map<String, Index> actual = indexes(table);
            for (JsonNode index : expected.path("indexes")) {
                Index value = actual.get(index.path("name").asText());
                if (value == null || value.unique != index.path("unique").asBoolean()
                    || !new ArrayList<>(value.columns.values()).equals(strings(index.path("columns")))
                    || dialect != Dialect.SQLITE && !SchemaExpression.normalize(value.where)
                        .equals(SchemaExpression.normalize(index.path("where").asText(null)))) {
                    return "索引 " + index.path("name").asText();
                }
            }
            for (JsonNode columns : expected.path("unique")) {
                if (actual.values().stream().noneMatch(index -> index.unique
                    && new ArrayList<>(index.columns.values()).equals(strings(columns)))) return "唯一约束";
            }
            if (!foreignKeys(table).equals(expectedForeignKeys(expected.path("foreignKeys")))) return "外键";
            if (dialect != Dialect.SQLITE) {
                String extra = extraIndex(actual, expected);
                if (extra != null) return extra;
                List<String> checks = strings(expected.path("checks")).stream().map(SchemaExpression::normalize).sorted()
                    .collect(java.util.stream.Collectors.toList());
                if (!checks.equals(checks(table))) return "CHECK 约束";
            }
        } catch (SQLException error) {
            throw new SchemaMigrator.Failure("无法读取 " + table + " 的数据库元数据");
        }
        return null;
    }

    private String extraIndex(Map<String, Index> actual, JsonNode expected) {
        List<List<String>> unnamed = new ArrayList<>();
        expected.path("unique").forEach(columns -> unnamed.add(strings(columns)));
        java.util.Set<String> names = new java.util.HashSet<>();
        expected.path("indexes").forEach(index -> names.add(index.path("name").asText()));
        for (Map.Entry<String, Index> entry : actual.entrySet()) {
            Index index = entry.getValue();
            if (index.primary || names.contains(entry.getKey())) continue;
            if (index.unique && (dialect == Dialect.MYSQL || index.implicitUnique)
                && unnamed.remove(new ArrayList<>(index.columns.values()))) continue;
            return "额外索引 " + entry.getKey();
        }
        return unnamed.isEmpty() ? null : "唯一约束";
    }

    private List<String> checks(String table) {
        List<Row> found = dialect == Dialect.MYSQL
            ? rows("SELECT c.check_clause AS expression FROM information_schema.table_constraints t " +
                "JOIN information_schema.check_constraints c ON t.constraint_schema=c.constraint_schema " +
                "AND t.constraint_name=c.constraint_name WHERE t.table_schema=DATABASE() AND t.table_name=? " +
                "AND t.constraint_type='CHECK' AND t.enforced='YES'", table)
            : rows("SELECT pg_get_expr(c.conbin,c.conrelid) AS expression FROM pg_constraint c " +
                "JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace " +
                "WHERE ns.nspname=current_schema() AND t.relname=? AND c.contype='c' AND c.convalidated", table);
        return found.stream().map(row -> row.text("expression"))
            .map(value -> dialect == Dialect.MYSQL ? mysqlExpression(value) : value)
            .map(SchemaExpression::normalize).sorted().collect(java.util.stream.Collectors.toList());
    }

    private boolean sameColumn(JsonNode expected, Row row) {
        if (row == null) return false;
        String wantedType = normalizeType(expected.path("type").asText());
        String actualType = normalizeType(row.text("type"));
        if (!wantedType.equals(actualType) || expected.path("nullable").asBoolean() != row.yes("nullable")) return false;
        boolean identity = dialect == Dialect.MYSQL && String.valueOf(row.text("identity")).contains("auto_increment")
            || dialect == Dialect.POSTGRES && "BY DEFAULT".equals(row.text("identity"));
        if (dialect != Dialect.SQLITE && expected.path("identity").asBoolean() != identity) return false;
        String generated = row.text("generated_sql");
        if (dialect == Dialect.MYSQL && generated != null) generated = mysqlExpression(generated);
        if (dialect != Dialect.SQLITE &&
            (!SchemaExpression.normalize(expected.path("generated").asText(null)).equals(SchemaExpression.normalize(generated))
                || !Objects.equals(expected.path("collation").asText(null), row.text("collation")))) return false;
        String actualDefault = row.text("default_value");
        if (dialect == Dialect.MYSQL && actualDefault != null && actualType.matches("varchar.*|longtext|text")
            && !String.valueOf(row.text("identity")).contains("DEFAULT_GENERATED")) {
            actualDefault = "'" + actualDefault.replace("'", "''") + "'";
        }
        if (dialect == Dialect.MYSQL && actualDefault != null) actualDefault = mysqlExpression(actualDefault);
        return identity || Objects.equals(normalizeDefault(expected.path("default").asText(null)), normalizeDefault(actualDefault));
    }

    private static String mysqlExpression(String value) {
        Matcher matcher = MYSQL_HEX.matcher(value.replace("\\'", "'"));
        return matcher.replaceAll(match -> {
            String hex = match.group(1);
            byte[] bytes = new byte[hex.length() / 2];
            for (int index = 0; index < bytes.length; index++) {
                bytes[index] = (byte) Integer.parseInt(hex.substring(index * 2, index * 2 + 2), 16);
            }
            return Matcher.quoteReplacement("'" + new String(bytes, StandardCharsets.UTF_8).replace("'", "''") + "'");
        });
    }

    private static String normalizeType(String type) {
        if (type == null) return "";
        return type.toLowerCase(Locale.ROOT).replace("character varying", "varchar")
            .replaceAll("^integer$", "int").replaceAll("^int\\(\\d+\\)$", "int")
            .replaceAll("^tinyint\\(\\d+\\)$", "tinyint");
    }

    private static String normalizeDefault(String value) {
        if (value == null) return null;
        String result = value.trim().replaceAll("::(?:character varying|text|bigint|integer|smallint|numeric|double precision)$", "")
            .replaceAll("^_(?:utf8mb4|utf8mb3|ascii)(?=')", "").replace("\\'", "'");
        while (result.startsWith("(") && result.endsWith(")")) result = result.substring(1, result.length() - 1).trim();
        if (result.startsWith("'")) return result;
        try {
            return new java.math.BigDecimal(result).stripTrailingZeros().toPlainString();
        } catch (NumberFormatException ignored) {
            return result;
        }
    }

    private List<Row> columns(String table) {
        switch (dialect) {
            case SQLITE:
                return rows("SELECT name,type,(\"notnull\" = 0) AS nullable,dflt_value AS default_value,pk " +
                    "FROM pragma_table_info(?)", table);
            case MYSQL:
                return rows("SELECT c.column_name AS name, c.column_type AS type, c.is_nullable='YES' AS nullable, " +
                    "c.column_default AS default_value, c.extra AS identity, NULLIF(c.generation_expression,'') AS generated_sql, " +
                    "NULLIF(c.collation_name,t.table_collation) AS collation, t.engine, t.table_collation " +
                    "FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema " +
                    "AND t.table_name=c.table_name WHERE c.table_schema=DATABASE() AND c.table_name=?", table);
            case POSTGRES:
                return rows("SELECT column_name AS name, CASE WHEN data_type = 'character varying' THEN " +
                    "'varchar(' || character_maximum_length || ')' ELSE data_type END AS type, " +
                    "(is_nullable = 'YES') AS nullable, column_default AS default_value, identity_generation AS identity, " +
                    "generation_expression AS generated_sql, collation_name AS collation FROM information_schema.columns " +
                    "WHERE table_schema = current_schema() AND table_name = ?", table);
            default: throw new IllegalStateException();
        }
    }

    private List<Row> tables() {
        return dialect == Dialect.MYSQL
            ? rows("SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'")
            : rows("SELECT table_name AS name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE'");
    }

    private DatabaseMetaData metadata() throws SQLException {
        return connection.getMetaData();
    }

    private String catalog() throws SQLException {
        return dialect == Dialect.MYSQL ? connection.getCatalog() : null;
    }

    private String schema() throws SQLException {
        return dialect == Dialect.POSTGRES ? connection.getSchema() : null;
    }

    private List<String> primary(String table, List<Row> columns) throws SQLException {
        TreeMap<Integer, String> order = new TreeMap<>();
        if (dialect == Dialect.SQLITE) {
            for (Row column : columns) {
                if (column.integer("pk") > 0) order.put((int) column.integer("pk"), column.text("name"));
            }
        } else {
            try (ResultSet keys = metadata().getPrimaryKeys(catalog(), schema(), table)) {
                while (keys.next()) order.put(keys.getInt("KEY_SEQ"), keys.getString("COLUMN_NAME"));
            }
        }
        return new ArrayList<>(order.values());
    }

    private static final class Index {
        final boolean unique;
        final TreeMap<Integer, String> columns = new TreeMap<>();
        boolean primary;
        boolean implicitUnique;
        String where;
        Index(boolean unique) { this.unique = unique; }
    }

    private Map<String, Index> indexes(String table) throws SQLException {
        Map<String, Index> answer = new HashMap<>();
        if (dialect == Dialect.MYSQL) {
            for (Row row : rows("SELECT index_name AS name, column_name, seq_in_index AS position, sub_part, " +
                "non_unique=0 AS unique_index FROM information_schema.statistics WHERE table_schema=DATABASE() " +
                "AND table_name=?", table)) {
                Index index = answer.computeIfAbsent(row.text("name"), name -> new Index(row.yes("unique_index")));
                index.primary = row.text("name").equals("PRIMARY");
                String column = row.text("column_name");
                if (row.get("sub_part") != null) column += "(" + row.integer("sub_part") + ")";
                index.columns.put((int) row.integer("position"), column);
            }
            return answer;
        }
        if (dialect == Dialect.POSTGRES) {
            for (Row row : rows("SELECT ix.relname AS name, COALESCE(a.attname,pg_get_indexdef(i.indexrelid,pos.n::integer,true)) AS column_name," +
                "i.indisunique AS unique_index,i.indisprimary AS primary_index,pos.n AS position," +
                "EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=ix.oid AND c.contype='u') AS implicit_unique," +
                "pg_get_expr(i.indpred,i.indrelid) AS predicate FROM pg_index i JOIN pg_class tbl ON tbl.oid=i.indrelid " +
                "JOIN pg_class ix ON ix.oid=i.indexrelid JOIN pg_namespace ns ON ns.oid=tbl.relnamespace " +
                "JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS pos(attnum,n) ON true " +
                "LEFT JOIN pg_attribute a ON a.attrelid=tbl.oid AND a.attnum=pos.attnum " +
                "WHERE ns.nspname=current_schema() AND tbl.relname=? AND i.indisvalid", table)) {
                Index index = answer.computeIfAbsent(row.text("name"), name -> new Index(row.yes("unique_index")));
                index.primary = row.yes("primary_index");
                index.implicitUnique = row.yes("implicit_unique");
                index.where = row.text("predicate");
                index.columns.put((int) row.integer("position"), row.text("column_name"));
            }
            return answer;
        }
        try (ResultSet result = metadata().getIndexInfo(catalog(), schema(), table, false, true)) {
            while (result.next()) {
                String name = result.getString("INDEX_NAME");
                if (name == null) continue;
                Index index = answer.get(name);
                if (index == null) {
                    index = new Index(!result.getBoolean("NON_UNIQUE"));
                    answer.put(name, index);
                }
                index.columns.put(result.getInt("ORDINAL_POSITION"), result.getString("COLUMN_NAME"));
            }
        }
        return answer;
    }

    private List<String> foreignKeys(String table) throws SQLException {
        Map<String, TreeMap<Integer, String>> keys = new HashMap<>();
        if (dialect == Dialect.SQLITE) {
            for (Row row : rows("SELECT id, seq, \"table\" AS target, \"from\" AS source, \"to\" AS target_column, " +
                "on_delete, on_update FROM pragma_foreign_key_list(?)", table)) {
                keys.computeIfAbsent(row.text("id"), key -> new TreeMap<>()).put((int) row.integer("seq"),
                    reference(row.text("source"), row.text("target"), row.text("target_column"),
                        row.text("on_delete"), row.text("on_update")));
            }
        } else {
            try (ResultSet result = metadata().getImportedKeys(catalog(), schema(), table)) {
                while (result.next()) {
                    keys.computeIfAbsent(result.getString("FK_NAME"), key -> new TreeMap<>())
                        .put(result.getInt("KEY_SEQ"), reference(result.getString("FKCOLUMN_NAME"),
                            result.getString("PKTABLE_NAME"), result.getString("PKCOLUMN_NAME"),
                            action(result.getInt("DELETE_RULE")), action(result.getInt("UPDATE_RULE"))));
                }
            }
        }
        return keys.values().stream().map(columns -> String.join(",", columns.values())).sorted().collect(java.util.stream.Collectors.toList());
    }

    private static List<String> expectedForeignKeys(JsonNode expected) {
        List<String> result = new ArrayList<>();
        for (JsonNode key : expected) {
            List<String> columns = new ArrayList<>();
            for (int index = 0; index < key.path("columns").size(); index++) {
                columns.add(reference(key.path("columns").get(index).asText(), key.path("table").asText(),
                    key.path("references").get(index).asText(), key.path("onDelete").asText(), key.path("onUpdate").asText()));
            }
            result.add(String.join(",", columns));
        }
        result.sort(String::compareTo);
        return result;
    }

    private static String reference(String column, String table, String target, String delete, String update) {
        return column + "/" + table + "/" + target + "/" + delete.replace("RESTRICT", "NO ACTION")
            + "/" + update.replace("RESTRICT", "NO ACTION");
    }

    private static String action(int action) {
        switch (action) {
            case DatabaseMetaData.importedKeyCascade: return "CASCADE";
            case DatabaseMetaData.importedKeySetNull: return "SET NULL";
            case DatabaseMetaData.importedKeySetDefault: return "SET DEFAULT";
            default: return "NO ACTION";
        }
    }

    private static List<String> strings(JsonNode nodes) {
        List<String> result = new ArrayList<>();
        nodes.forEach(node -> result.add(node.asText()));
        return result;
    }

    private List<Row> rows(String query, Object... args) {
        return KitDatabase.query(sql, query, args);
    }
}
