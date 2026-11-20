package org.openagentkit.server.store;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitJson;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.support.SQLStateSQLExceptionTranslator;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.sqlite.SQLiteException;

import javax.annotation.PreDestroy;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.sql.Blob;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

@Component
public final class KitDatabase {
    public enum Dialect { SQLITE, MYSQL, POSTGRES }
    public final Dialect dialect;
    private final HikariDataSource source;
    private final JdbcTemplate sql;
    private final TransactionTemplate transactions;

    public KitDatabase(KitConfig config, KitJson json) throws IOException {
        this.dialect = dialect(config);
        Files.createDirectories(config.dataDir());
        HikariConfig pool = pool(config);
        this.source = new HikariDataSource(pool);
        try (Connection connection = source.getConnection()) {
            new SchemaMigrator(connection, dialect, json).migrate();
        } catch (SQLException | RuntimeException exception) {
            source.close();
            throw new IllegalStateException("Kit 数据库初始化失败" +
                (exception instanceof SchemaMigrator.Failure ? "。 " + exception.getMessage() : sqlCode(exception)));
        }
        this.sql = new JdbcTemplate(source);
        if (dialect == Dialect.SQLITE) {
            SQLStateSQLExceptionTranslator fallback = new SQLStateSQLExceptionTranslator();
            sql.setExceptionTranslator((task, statement, error) -> {
                if (error instanceof SQLiteException) {
                    switch (((SQLiteException) error).getResultCode()) {
                        case SQLITE_CONSTRAINT_PRIMARYKEY:
                        case SQLITE_CONSTRAINT_UNIQUE:
                        case SQLITE_CONSTRAINT_ROWID:
                            return new DuplicateKeyException("Kit 数据记录已存在", error);
                        default:
                            break;
                    }
                }
                return fallback.translate(task, statement, error);
            });
        }
        this.transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
    }

    public List<Row> all(String query, Object... params) {
        return query(sql, query, params);
    }

    static List<Row> query(JdbcTemplate template, String query, Object... params) {
        return template.query(query, (result, index) -> map(result), params);
    }

    public Row one(String query, Object... params) {
        List<Row> rows = all(query, params);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public int run(String query, Object... params) {
        return sql.update(query, params);
    }

    public <T> T tx(Supplier<T> work) {
        return transactions.execute(status -> work.get());
    }

    public String ignoreConflict(String insert, String key) {
        if (dialect == Dialect.MYSQL) {
            String first = key.split(",", 2)[0].trim();
            return insert + " ON DUPLICATE KEY UPDATE " + first + " = " + first;
        }
        return insert + " ON CONFLICT (" + key + ") DO NOTHING";
    }

    public String upsert(String insert, String keys, String... columns) {
        String assignments = String.join(", ", java.util.Arrays.stream(columns)
            .map(column -> column + " = " + (dialect == Dialect.MYSQL ? "VALUES(" + column + ")" : "excluded." + column))
            .toArray(String[]::new));
        return insert + (dialect == Dialect.MYSQL ? " ON DUPLICATE KEY UPDATE " : " ON CONFLICT (" + keys + ") DO UPDATE SET ")
            + assignments;
    }

    @PreDestroy
    void close() {
        source.close();
    }

    static Row map(ResultSet result) throws SQLException {
        Row row = new Row();
        for (int index = 1; index <= result.getMetaData().getColumnCount(); index++) {
            Object value = result.getObject(index);
            if (value instanceof Blob) {
                Blob blob = (Blob) value;
                value = blob.getBytes(1, Math.toIntExact(blob.length()));
            }
            row.put(result.getMetaData().getColumnLabel(index).toLowerCase(Locale.ROOT), value);
        }
        return row;
    }

    public static final class Row extends LinkedHashMap<String, Object> {
        public String text(String key) {
            Object value = get(key);
            return value == null ? null : value.toString();
        }

        public long integer(String key) {
            Object value = get(key);
            return value == null ? 0L : ((Number) value).longValue();
        }

        public double decimal(String key) {
            Object value = get(key);
            return value == null ? 0.0 : ((Number) value).doubleValue();
        }

        public boolean yes(String key) {
            Object value = get(key);
            return value instanceof Boolean ? (Boolean) value : value instanceof Number && ((Number) value).intValue() != 0;
        }

        public byte[] bytes(String key) {
            return (byte[]) get(key);
        }
    }

    private HikariConfig pool(KitConfig config) {
        HikariConfig pool = new HikariConfig();
        pool.setPoolName("kit-db");
        pool.setMaximumPoolSize(dialect == Dialect.SQLITE ? 1 : 10);
        pool.setConnectionTimeout(15000);
        if (dialect == Dialect.SQLITE) {
            pool.setJdbcUrl("jdbc:sqlite:" + config.dataDir().resolve("kit.sqlite"));
            pool.addDataSourceProperty("busy_timeout", "15000");
            pool.addDataSourceProperty("foreign_keys", "true");
            pool.addDataSourceProperty("journal_mode", "WAL");
            return pool;
        }
        configureExternal(pool, config.value("KIT_DATABASE_URL", ""), dialect);
        return pool;
    }

    private static void configureExternal(HikariConfig pool, String value, Dialect dialect) {
        try {
            URI url = URI.create(value);
            boolean mysql = dialect == Dialect.MYSQL;
            if (!(mysql ? "mysql".equals(url.getScheme())
                        : List.of("postgresql", "postgres").contains(url.getScheme()))
                || url.getHost() == null || url.getRawUserInfo() == null || url.getFragment() != null
                || !url.getRawPath().matches("/[^/]+")
                || !(url.getQuery() == null || url.getQuery().equals("ssl=true"))) {
                throw new IllegalArgumentException();
            }
            String[] user = url.getRawUserInfo().split(":", 2);
            if (user[0].isEmpty()) throw new IllegalArgumentException();
            int port = url.getPort() < 0 ? (mysql ? 3306 : 5432) : url.getPort();
            String ssl = mysql ? "sslMode=" + (url.getQuery() == null ? "DISABLED" : "VERIFY_IDENTITY")
                : "sslmode=" + (url.getQuery() == null ? "disable" : "verify-full");
            pool.setJdbcUrl("jdbc:" + (mysql ? "mysql" : "postgresql") + "://" + url.getHost()
                + ":" + port + url.getRawPath() + "?" + ssl);
            pool.setUsername(decode(user[0]));
            pool.setPassword(user.length == 2 ? decode(user[1]) : "");
        } catch (RuntimeException ignored) {
            throw new IllegalArgumentException("KIT_DATABASE_URL 与所选数据库不匹配");
        }
    }

    private static String decode(String value) {
        return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
    }

    private static String sqlCode(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException) {
                SQLException sql = (SQLException) cause;
                return "（SQLState " + sql.getSQLState() + "，驱动错误 " + sql.getErrorCode() + "）";
            }
        }
        return "（" + error.getClass().getSimpleName() + "）";
    }

    private static Dialect dialect(KitConfig config) {
        switch (config.value("KIT_DB_DRIVER", "sqlite")) {
            case "sqlite": return Dialect.SQLITE;
            case "mysql": return Dialect.MYSQL;
            case "postgres":
            case "pg": return Dialect.POSTGRES;
            default: throw new IllegalArgumentException("KIT_DB_DRIVER 只能是 sqlite、mysql 或 postgres");
        }
    }
}
