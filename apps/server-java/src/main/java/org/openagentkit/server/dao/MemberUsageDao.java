package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Repository
public class MemberUsageDao {
    public static final List<String> METRICS = List.of("input_tokens", "output_tokens", "cache_read_input_tokens",
        "cache_creation_input_tokens", "active_seconds", "duration_seconds");
    private final KitDatabase db;

    MemberUsageDao(KitDatabase db) {
        this.db = db;
    }

    public List<Row> listAgentSlugs(String memberId) {
        return db.all("SELECT DISTINCT agent_slug FROM kit_session_usage WHERE member_id=? ORDER BY agent_slug", memberId);
    }

    public List<Row> listUnrecordedSessions(String memberId) {
        return db.all("SELECT s.session_id,s.agent_slug,s.title,s.status,s.created_at FROM kit_sessions s " +
            "LEFT JOIN kit_session_usage u ON u.session_id=s.session_id WHERE s.subject_id=? AND s.purpose='experience' " +
            "AND u.session_id IS NULL", memberId);
    }

    public int insertSessionUsage(String sessionId, String memberId, String agentSlug, String title, String status, String createdAt) {
        return db.run(db.ignoreConflict("INSERT INTO kit_session_usage (session_id,member_id,agent_slug,title,status,created_at) " +
            "VALUES (?,?,?,?,?,?)", "session_id"),
            sessionId, memberId, agentSlug, title, status, createdAt);
    }

    public List<Row> listUnfinalizedSessions(String memberId) {
        return db.all("SELECT session_id FROM kit_session_usage WHERE member_id=? AND finalized_at IS NULL " +
            "AND NOT EXISTS (SELECT 1 FROM kit_session_deletions d WHERE d.session_id=kit_session_usage.session_id)",
            memberId);
    }

    public int markCollectionFailure(String collectionStatus, String attemptedAt, String sessionId) {
        return db.run("UPDATE kit_session_usage SET collection_status=?,attempted_at=? WHERE session_id=? AND finalized_at IS NULL",
            collectionStatus, attemptedAt, sessionId);
    }

    public List<Row> listTemplates(String namePattern, String agentPattern) {
        return db.all("SELECT t.template_id,t.name,t.remote_agent_id,t.remote_agent_name,c.status AS listing_status,c.slug " +
            "FROM kit_templates t LEFT JOIN kit_template_listings l ON l.template_id=t.template_id " +
            "LEFT JOIN catalog_agents c ON c.id=l.catalog_id WHERE (LOWER(t.name) LIKE ? ESCAPE '!' OR LOWER(t.remote_agent_name) LIKE ? ESCAPE '!') " +
            "ORDER BY t.created_at DESC,t.template_id DESC", namePattern, agentPattern);
    }

    public Row findTemplateListing(String templateId) {
        return db.one("SELECT t.template_id,c.slug FROM kit_templates t LEFT JOIN kit_template_listings l " +
            "ON l.template_id=t.template_id LEFT JOIN catalog_agents c ON c.id=l.catalog_id WHERE t.template_id=?",
            templateId);
    }

    public Row findListedSlug(String templateId) {
        return db.one("SELECT c.slug FROM kit_template_listings l JOIN catalog_agents c ON c.id=l.catalog_id WHERE l.template_id=?",
            templateId);
    }

    public Row firstUsageDay() {
        return db.one("SELECT MIN(day) AS since_day FROM kit_usage_limit_agent_days");
    }

    public Row firstUsageDayForAgent(String agentSlug) {
        return db.one("SELECT MIN(day) AS since_day FROM kit_usage_limit_agent_days WHERE agent_slug=?", agentSlug);
    }

    public void updateUsage(String sessionId, String status, Map<String, Number> observed, String collectionStatus, String now) {
        List<Object> args = new ArrayList<>();
        args.add(status);
        METRICS.forEach(metric -> args.add(observed.get(metric)));
        args.addAll(List.of(collectionStatus, now, now, sessionId));
        db.run("UPDATE kit_session_usage SET status=?, " + METRICS.stream().map(key -> key + "=COALESCE(?," + key + ")")
            .collect(Collectors.joining(",")) + ",collection_status=?,captured_at=?,attempted_at=? " +
            "WHERE session_id=? AND finalized_at IS NULL", args.toArray());
    }

    public Row aggregate(String memberId, String agentSlug) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        if (memberId != null) {
            where.append(" AND member_id=?");
            args.add(memberId);
        }
        if (agentSlug != null) {
            where.append(" AND agent_slug=?");
            args.add(agentSlug);
        }
        String totals = METRICS.stream().map(metric -> "SUM(" + metric + ") AS " + metric + ",COUNT(" + metric + ") AS " + metric + "_covered")
            .collect(Collectors.joining(","));
        return db.one("SELECT " + totals + ",COUNT(*) AS total,COUNT(deleted_at) AS deleted,COUNT(attempted_at) AS completed," +
            "MAX(captured_at) AS refreshed,SUM(CASE WHEN collection_status IN ('failed','not_found') THEN 1 ELSE 0 END) AS failed," +
            "SUM(CASE WHEN collection_status IN ('partial','failed','not_found') THEN 1 ELSE 0 END) AS incomplete " +
            "FROM kit_session_usage" + where, args.toArray());
    }

    public List<Row> listUsage(String target, String slug, boolean template, String cursorAt, String cursorId, int limit) {
        List<Object> args = new ArrayList<>();
        String query = template
            ? "SELECT u.*,m.display_name AS member_display_name,m.username AS member_username FROM kit_session_usage u " +
                "JOIN kit_members m ON m.member_id=u.member_id WHERE u.agent_slug=?"
            : "SELECT u.* FROM kit_session_usage u WHERE u.member_id=?" + (slug == null ? "" : " AND u.agent_slug=?");
        args.add(template ? slug : target);
        if (!template && slug != null) args.add(slug);
        if (cursorAt != null) {
            query += " AND (u.created_at<? OR (u.created_at=? AND u.session_id<?))";
            args.addAll(List.of(cursorAt, cursorAt, cursorId));
        }
        args.add(limit);
        return db.all(query + " ORDER BY u.created_at DESC,u.session_id DESC LIMIT ?", args.toArray());
    }
}
