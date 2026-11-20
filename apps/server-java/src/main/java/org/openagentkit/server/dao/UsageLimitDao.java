package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class UsageLimitDao {
    private final KitDatabase db;

    UsageLimitDao(KitDatabase db) {
        this.db = db;
    }

    public Row findAdmissionMonth(String sessionId) {
        return db.one("SELECT admission_month FROM kit_usage_limit_sessions WHERE session_id=?", sessionId);
    }

    public Row findTemplateRuleForAgent(String agentSlug) {
        return db.one("SELECT q.* FROM kit_usage_limit_templates q JOIN kit_template_listings l " +
            "ON l.template_id=q.template_id JOIN catalog_agents c ON c.id=l.catalog_id WHERE c.slug=?",
            agentSlug);
    }

    public List<Row> listOpenRequests(String memberId) {
        return db.all("SELECT * FROM kit_usage_limit_requests WHERE member_id=? AND status IN ('sending','uncertain','accepted')",
            memberId);
    }

    public int settleRequest(String sessionId, String requestKey) {
        return db.run("UPDATE kit_usage_limit_requests SET status='settled' WHERE session_id=? AND request_key=?",
            sessionId, requestKey);
    }

    public Row findDeletedUsage(String sessionId) {
        return db.one("SELECT deleted_at FROM kit_session_usage WHERE session_id=?", sessionId);
    }

    public List<Row> listPeerBaselines(String memberId, String month, String reportedSlug, String liveSlug) {
        return db.all("SELECT b.*, u.finalized_at,u.deleted_at,u.input_tokens AS final_input," +
            "u.output_tokens AS final_output,u.active_seconds AS final_seconds FROM kit_usage_limit_sessions b " +
            "LEFT JOIN kit_session_usage u ON u.session_id=b.session_id LEFT JOIN kit_sessions s ON s.session_id=b.session_id " +
            "WHERE b.member_id<>? AND b.admission_month=? AND (u.agent_slug=? OR s.agent_slug=?)",
            memberId, month, reportedSlug, liveSlug);
    }

    public int createBaseline(String sessionId, String memberId) {
        return db.run(db.ignoreConflict("INSERT INTO kit_usage_limit_sessions (session_id,member_id) VALUES (?,?)", "session_id"),
            sessionId, memberId);
    }

    public int assignAdmissionMonth(String month, String sessionId) {
        return db.run("UPDATE kit_usage_limit_sessions SET admission_month=? WHERE session_id=?", month, sessionId);
    }

    public int insertRequest(String sessionId, String requestKey, String memberId, String requestHash, String status, String createdAt) {
        return db.run("INSERT INTO kit_usage_limit_requests (session_id,request_key,member_id,request_hash,status,created_at) VALUES (?,?,?,?,?,?)",
            sessionId, requestKey, memberId, requestHash, status, createdAt);
    }

    public int acceptRequest(String eventIdsJson, String sessionId, String requestKey) {
        return db.run("UPDATE kit_usage_limit_requests SET status='accepted',event_ids=? WHERE session_id=? AND request_key=?",
            eventIdsJson, sessionId, requestKey);
    }

    public int deleteRequest(String sessionId, String requestKey) {
        return db.run("DELETE FROM kit_usage_limit_requests WHERE session_id=? AND request_key=?", sessionId, requestKey);
    }

    public int markUncertain(String sessionId, String requestKey) {
        return db.run("UPDATE kit_usage_limit_requests SET status='uncertain' WHERE session_id=? AND request_key=?",
            sessionId, requestKey);
    }

    public Row findTurn(String sessionId, String clientMessageId) {
        return db.one("SELECT 1 FROM usage_turns WHERE session_id=? AND client_message_id=?", sessionId, clientMessageId);
    }

    public int addTurn(String subjectId, String agentSlug, String sessionId, String clientMessageId, String day, String month, String createdAt) {
        return db.run("INSERT INTO usage_turns (subject_id,agent_slug,session_id,client_message_id,day,month,created_at) VALUES (?,?,?,?,?,?,?)",
            subjectId, agentSlug, sessionId, clientMessageId, day, month, createdAt);
    }

    public Row findPolicy() {
        return db.one("SELECT * FROM kit_usage_limit_policy WHERE id=1");
    }

    public int createMemberAccounting(String memberId, String startedAt) {
        return db.run(db.ignoreConflict("INSERT INTO kit_usage_limit_members (member_id,accounting_started_at) VALUES (?,?)", "member_id"),
            memberId, startedAt);
    }

    public List<Row> listTrackedSessions(String memberId) {
        return db.all("SELECT s.*,b.admission_month,u.finalized_at,u.deleted_at,u.input_tokens AS final_input," +
            "u.output_tokens AS final_output,u.active_seconds AS final_seconds FROM kit_sessions s " +
            "LEFT JOIN kit_usage_limit_sessions b ON b.session_id=s.session_id " +
            "LEFT JOIN kit_session_usage u ON u.session_id=s.session_id WHERE s.purpose='experience' AND s.subject_id=?",
            memberId);
    }

    public Row findBaseline(String sessionId) {
        return db.one("SELECT * FROM kit_usage_limit_sessions WHERE session_id=?", sessionId);
    }

    public int updateBaseline(String sessionId, String memberId, Number input, Number output, Number activeSeconds, String month, Object capturedAt) {
        return db.run(db.upsert("INSERT INTO kit_usage_limit_sessions (session_id,member_id,input_tokens,output_tokens,active_seconds," +
            "admission_month,captured_at) VALUES (?,?,?,?,?,?,?)", "session_id", "input_tokens", "output_tokens", "active_seconds", "captured_at"),
            sessionId, memberId, input, output, activeSeconds, month, capturedAt);
    }

    public Row findOverride(String memberId) {
        return db.one("SELECT * FROM kit_usage_limit_overrides WHERE member_id=?", memberId);
    }

    public Row findMemberMonth(String memberId, String month) {
        return db.one("SELECT * FROM kit_usage_limit_months WHERE member_id=? AND month=?", memberId, month);
    }

    public Row findMemberDay(String memberId, String day) {
        return db.one("SELECT * FROM kit_usage_limit_days WHERE member_id=? AND day=?", memberId, day);
    }

    public Row findAccountingStart(String memberId) {
        return db.one("SELECT accounting_started_at FROM kit_usage_limit_members WHERE member_id=?", memberId);
    }

    public Row findTemplateSlug(String templateId) {
        return db.one("SELECT c.slug FROM kit_template_listings l JOIN catalog_agents c ON c.id=l.catalog_id " +
            "WHERE l.template_id=?", templateId);
    }

    public Row findTemplateRule(String templateId) {
        return db.one("SELECT * FROM kit_usage_limit_templates WHERE template_id=?", templateId);
    }

    public Row findAgentMonth(String agentSlug, String month) {
        return db.one("SELECT * FROM kit_usage_limit_agent_months WHERE agent_slug=? AND month=?", agentSlug, month);
    }

    public Row findAgentDay(String agentSlug, String day) {
        return db.one("SELECT * FROM kit_usage_limit_agent_days WHERE agent_slug=? AND day=?", agentSlug, day);
    }

    public Row findCreditsPolicy() {
        return db.one("SELECT monthly_credits FROM quota_policy WHERE id=1");
    }

    public Row findCreditsOverride(String subjectId) {
        return db.one("SELECT monthly_credits FROM quota_override WHERE subject_id=?", subjectId);
    }

    public List<Row> listCreditPacks(String subjectId, String month) {
        return db.all("SELECT id,month,credits,reason,granted_by,created_at FROM quota_pack " +
            "WHERE subject_id=? AND month=? ORDER BY created_at DESC", subjectId, month);
    }

    public Row countUsedCredits(String subjectId, String month) {
        return db.one("SELECT COUNT(*) AS n FROM usage_turns WHERE subject_id=? AND month=?", subjectId, month);
    }

    public enum RuleScope {
        POLICY("kit_usage_limit_policy", "id"),
        MEMBER("kit_usage_limit_overrides", "member_id"),
        TEMPLATE("kit_usage_limit_templates", "template_id");

        private final String table;
        private final String key;

        RuleScope(String table, String key) {
            this.table = table;
            this.key = key;
        }
    }

    public enum Aggregate {
        MEMBER_MONTH("kit_usage_limit_months", "member_id", "month"),
        AGENT_MONTH("kit_usage_limit_agent_months", "agent_slug", "month"),
        MEMBER_DAY("kit_usage_limit_days", "member_id", "day"),
        AGENT_DAY("kit_usage_limit_agent_days", "agent_slug", "day");

        private final String table;
        private final String target;
        private final String period;

        Aggregate(String table, String target, String period) {
            this.table = table;
            this.target = target;
            this.period = period;
        }
    }

    public boolean targetExists(String id, boolean template) {
        return db.one(template ? "SELECT 1 FROM kit_templates WHERE template_id=?" : "SELECT 1 FROM kit_members WHERE member_id=?", id) != null;
    }

    public void saveRule(RuleScope scope, Object id, Number monthlyTokens, Number monthlySeconds, Number dailyTokens,
                         Number dailySeconds, String updatedAt, String updatedBy) {
        db.run(db.upsert("INSERT INTO " + scope.table + " (" + scope.key + ",monthly_tokens,monthly_active_seconds,daily_tokens," +
                "daily_active_seconds,updated_at,updated_by) VALUES (?,?,?,?,?,?,?)", scope.key,
                "monthly_tokens", "monthly_active_seconds", "daily_tokens", "daily_active_seconds", "updated_at", "updated_by"),
            id, monthlyTokens, monthlySeconds, dailyTokens, dailySeconds, updatedAt, updatedBy);
    }

    public void deleteRule(RuleScope scope, String id) {
        db.run("DELETE FROM " + scope.table + " WHERE " + scope.key + "=?", id);
    }

    public void increment(Aggregate scope, String id, String period, long tokens, double seconds) {
        db.run(db.ignoreConflict("INSERT INTO " + scope.table + " (" + scope.target + "," + scope.period +
            ",tokens,active_seconds) VALUES (?,?,0,0)", scope.target + "," + scope.period), id, period);
        db.run("UPDATE " + scope.table + " SET tokens=tokens+?, active_seconds=active_seconds+? WHERE " + scope.target + "=? AND " +
            scope.period + "=?", tokens, seconds, id, period);
    }

    public List<Row> dailyUsage(Aggregate scope, String fromDay, String id) {
        return id == null
            ? db.all("SELECT day,SUM(tokens) AS tokens,SUM(active_seconds) AS active_seconds FROM " + scope.table + " WHERE day>=? GROUP BY day", fromDay)
            : db.all("SELECT day,tokens,active_seconds FROM " + scope.table + " WHERE day>=? AND " + scope.target + "=?", fromDay, id);
    }
}
