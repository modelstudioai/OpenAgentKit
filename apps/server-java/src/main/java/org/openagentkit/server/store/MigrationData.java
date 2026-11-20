package org.openagentkit.server.store;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.store.KitDatabase.Dialect;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class MigrationData {
    private static final Pattern ADD_COLUMN = Pattern.compile("(?i)ALTER TABLE ([a-z0-9_]+) ADD COLUMN ([a-z0-9_]+) .*");
    private final JdbcTemplate sql;
    private final SchemaCatalog catalog;
    private final Dialect dialect;
    private final KitJson json;

    MigrationData(JdbcTemplate sql, SchemaCatalog catalog, Dialect dialect, KitJson json) {
        this.sql = sql;
        this.catalog = catalog;
        this.dialect = dialect;
        this.json = json;
    }

    void apply(JsonNode step) {
        if (step.has("data")) {
            step.get("data").forEach(statement -> sql.execute(statement.asText()));
            return;
        }
        if (step.has("addMissingColumns")) {
            for (JsonNode statement : step.get("addMissingColumns")) {
                Matcher matcher = ADD_COLUMN.matcher(statement.asText());
                if (!matcher.matches() || !catalog.hasColumn(matcher.group(1), matcher.group(2))) sql.execute(statement.asText());
            }
            return;
        }
        switch (step.path("transform").asText()) {
            case "legacyFiles": legacyFiles(); break;
            case "rebuildDailyUsage": rebuildDailyUsage(); break;
            case "retireDrafts": retireDrafts(); break;
            default: throw new SchemaMigrator.Failure("迁移含未知数据转换");
        }
    }

    private static final class Owner {
        final String subject;
        String since;
        boolean ambiguous;
        Owner(String subject, String since) {
            this.subject = subject;
            this.since = since;
        }
    }

    private void legacyFiles() {
        Map<String, Owner> owners = new LinkedHashMap<>();
        for (Row row : rows("SELECT subject_id, created_at, files_json FROM kit_sessions WHERE files_json IS NOT NULL")) {
            JsonNode attachments;
            try {
                attachments = json.stored(row.text("files_json"));
            } catch (IllegalStateException ignored) {
                continue;
            }
            if (!attachments.isArray()) continue;
            for (JsonNode item : attachments) {
                JsonNode id = item.path("file_id");
                if (!id.isTextual() || id.asText().replaceAll("^ +| +$", "").isEmpty()) continue;
                Owner owner = owners.computeIfAbsent(id.asText(), key -> new Owner(row.text("subject_id"), row.text("created_at")));
                if (!owner.subject.equals(row.text("subject_id"))) owner.ambiguous = true;
                else if (row.text("created_at").compareTo(owner.since) < 0) owner.since = row.text("created_at");
            }
        }
        String statement = "INSERT INTO kit_uploaded_files (file_id, subject_id, created_at) VALUES (?, ?, ?) "
            + (dialect == Dialect.MYSQL ? "ON DUPLICATE KEY UPDATE file_id=file_id" : "ON CONFLICT (file_id) DO NOTHING");
        owners.forEach((id, owner) -> {
            if (!owner.ambiguous) sql.update(statement, id, owner.subject, owner.since);
        });
    }

    private static final class Share {
        final String day;
        final long turns;
        long tokens;
        Share(Row row, long tokens, long total) {
            day = row.text("day");
            turns = row.integer("turns");
            this.tokens = (long) Math.floor(((double) tokens * turns) / total);
        }
    }

    private void rebuildDailyUsage() {
        sql.update("DELETE FROM kit_usage_limit_days");
        if (!catalog.exists("usage_turns")) return;
        for (Row month : rows("SELECT member_id,month,tokens,active_seconds FROM kit_usage_limit_months " +
            "WHERE tokens > 0 OR active_seconds > 0")) {
            List<Row> days = rows("SELECT day, COUNT(*) AS turns FROM usage_turns WHERE subject_id = ? " +
                "AND substr(day, 1, 7)=? GROUP BY day ORDER BY day", month.text("member_id"), month.text("month"));
            if (days.isEmpty()) continue;
            long total = days.stream().mapToLong(day -> day.integer("turns")).sum();
            List<Share> shares = new ArrayList<>();
            days.forEach(day -> shares.add(new Share(day, month.integer("tokens"), total)));
            long remainder = month.integer("tokens") - shares.stream().mapToLong(share -> share.tokens).sum();
            shares.stream().sorted(Comparator.comparingLong((Share share) -> share.turns).reversed()
                .thenComparing(share -> share.day, Comparator.reverseOrder())).limit(Math.max(0, remainder))
                .forEach(share -> share.tokens++);
            double remaining = month.decimal("active_seconds");
            for (int index = 0; index < shares.size(); index++) {
                Share share = shares.get(index);
                double seconds = index == shares.size() - 1 ? remaining : month.decimal("active_seconds") * share.turns / total;
                remaining -= seconds;
                sql.update("INSERT INTO kit_usage_limit_days (member_id,day,tokens,active_seconds) VALUES (?,?,?,?)",
                    month.text("member_id"), share.day, share.tokens, seconds);
            }
        }
    }

    private void retireDrafts() {
        for (Row draft : rows("SELECT * FROM kit_resource_drafts WHERE engine != 'yaml'")) {
            String id = draft.text("draft_id");
            draft.remove("active_owner");
            List<Row> document = rows("SELECT * FROM kit_resource_draft_documents WHERE draft_id=?", id);
            sql.update("INSERT INTO kit_retired_directory_drafts (draft_id,record_json,document_json,retired_at) VALUES (?,?,?,?)",
                id, json.write(draft), document.isEmpty() ? null : json.write(document.get(0)), KitJson.now());
            sql.update("DELETE FROM kit_resource_drafts WHERE draft_id=?", id);
        }
    }

    private List<Row> rows(String query, Object... args) {
        return KitDatabase.query(sql, query, args);
    }
}
