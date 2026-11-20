package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;

@Repository
public class SessionDao {
    private final KitDatabase db;

    SessionDao(KitDatabase db) {
        this.db = db;
    }

    public int updateStreamStatus(String status, String sessionId) {
        return db.run("UPDATE kit_sessions SET status=? WHERE session_id=? AND (status IS NULL OR status!='archived')",
            status, sessionId);
    }

    public List<Row> listAgents() {
        return db.all("SELECT * FROM catalog_agents WHERE status='listed' ORDER BY ordering,created_at");
    }

    public Row findListedAgent(String slug) {
        return db.one("SELECT * FROM catalog_agents WHERE slug=? AND status='listed'", slug);
    }

    public int insertSession(String sessionId, String subjectId, String purpose, String agentSlug, String remoteAgentId, String debugSource, String remoteEnvironmentId, String runtimeJson, String title, String status, String createdAt, String lastEventAt, String filesJson) {
        return db.run("INSERT INTO kit_sessions (session_id,subject_id,purpose,agent_slug,remote_agent_id,debug_source," +
            "remote_environment_id,runtime_json,title,status,created_at,last_event_at,files_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            sessionId, subjectId, purpose, agentSlug, remoteAgentId, debugSource, remoteEnvironmentId, runtimeJson, title, status, createdAt, lastEventAt, filesJson);
    }

    public List<Row> listRecentAgents(String subjectId) {
        return db.all("SELECT agent_slug, MAX(COALESCE(last_event_at,created_at)) AS at FROM kit_sessions " +
            "WHERE subject_id=? AND purpose='experience' AND (status IS NULL OR status!='archived') " +
            "GROUP BY agent_slug ORDER BY at DESC,agent_slug", subjectId);
    }

    public int reconcileRunning(String status, String sessionId) {
        return db.run("UPDATE kit_sessions SET status=? WHERE session_id=? AND status='running'", status, sessionId);
    }

    public Row findSendReceipt(String sessionId, String clientMessageId) {
        return db.one("SELECT request_hash,event_ids FROM kit_session_send_receipts WHERE session_id=? AND client_message_id=?",
            sessionId, clientMessageId);
    }

    public Row findLegacySendReceipt(String sessionId, String requestKey) {
        return db.one("SELECT request_hash,event_ids FROM kit_usage_limit_requests WHERE session_id=? AND request_key=?",
            sessionId, requestKey);
    }

    public int insertSendReceipt(String sessionId, String clientMessageId, String requestHash, String createdAt) {
        return db.run("INSERT INTO kit_session_send_receipts (session_id,client_message_id,request_hash,created_at) VALUES (?,?,?,?)",
            sessionId, clientMessageId, requestHash, createdAt);
    }

    public int deleteSendReceipt(String sessionId, String clientMessageId) {
        return db.run("DELETE FROM kit_session_send_receipts WHERE session_id=? AND client_message_id=?",
            sessionId, clientMessageId);
    }

    public int acceptSendReceipt(String eventIdsJson, String sessionId, String clientMessageId) {
        return db.run("UPDATE kit_session_send_receipts SET event_ids=? WHERE session_id=? AND client_message_id=?",
            eventIdsJson, sessionId, clientMessageId);
    }

    public int updateFilesAndLinks(String filesJson, String messageFilesJson, String sessionId) {
        return db.run("UPDATE kit_sessions SET files_json=?,message_files_json=? WHERE session_id=?",
            filesJson, messageFilesJson, sessionId);
    }

    public int updateFiles(String filesJson, String sessionId) {
        return db.run("UPDATE kit_sessions SET files_json=? WHERE session_id=?", filesJson, sessionId);
    }

    public int noteAcceptedMessage(String updatedAt, String sessionId) {
        return db.run("UPDATE kit_sessions SET last_event_at=?,status='running' WHERE session_id=?", updatedAt, sessionId);
    }

    public int renameSession(String title, String sessionId) {
        return db.run("UPDATE kit_sessions SET title=? WHERE session_id=?", title, sessionId);
    }

    public int archiveSession(String sessionId) {
        return db.run("UPDATE kit_sessions SET status='archived' WHERE session_id=?", sessionId);
    }

    public Row findOwnedSession(String sessionId, String subjectId, String purpose) {
        return db.one("SELECT * FROM kit_sessions WHERE session_id=? AND subject_id=? AND purpose=?",
            sessionId, subjectId, purpose);
    }

    public Row findUpload(String fileId, String subjectId, String purpose) {
        return db.one("SELECT file_id FROM kit_uploaded_files WHERE file_id=? AND subject_id=? AND purpose=?",
            fileId, subjectId, purpose);
    }

    public int insertUpload(String fileId, String subjectId, String purpose, String createdAt) {
        return db.run("INSERT INTO kit_uploaded_files (file_id,subject_id,purpose,created_at) VALUES (?,?,?,?)",
            fileId, subjectId, purpose, createdAt);
    }

    public Row findOwnedSessionId(String sessionId, String subjectId, String purpose) {
        return db.one("SELECT session_id FROM kit_sessions WHERE session_id=? AND subject_id=? AND purpose=?",
            sessionId, subjectId, purpose);
    }

    public Row findDeletion(String sessionId) {
        return db.one("SELECT session_id FROM kit_session_deletions WHERE session_id=?", sessionId);
    }

    public Row findDeletionStage(String sessionId) {
        return db.one("SELECT stage FROM kit_session_deletions WHERE session_id=?", sessionId);
    }

    public Row findFinalizedUsage(String sessionId) {
        return db.one("SELECT session_id FROM kit_session_usage WHERE session_id=? AND finalized_at IS NOT NULL",
            sessionId);
    }

    public int saveFinalUsage(String sessionId, String memberId, String agentSlug, String title, String status, String createdAt, Object inputTokens, Object outputTokens, Object cacheRead, Object cacheCreation, Object activeSeconds, Object durationSeconds, String collectionStatus, String capturedAt, String attemptedAt, String finalizedAt) {
        return db.run(db.upsert("INSERT INTO kit_session_usage (session_id,member_id,agent_slug,title,status,created_at," +
            "input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens,active_seconds,duration_seconds," +
            "collection_status,captured_at,attempted_at,finalized_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            "session_id", "title", "status", "input_tokens", "output_tokens", "cache_read_input_tokens",
            "cache_creation_input_tokens", "active_seconds", "duration_seconds", "collection_status",
            "captured_at", "attempted_at", "finalized_at"),
            sessionId, memberId, agentSlug, title, status, createdAt, inputTokens, outputTokens, cacheRead, cacheCreation, activeSeconds, durationSeconds, collectionStatus, capturedAt, attemptedAt, finalizedAt);
    }

    public int saveDeletion(String sessionId, String subjectId, String stage, String updatedAt) {
        return db.run(db.upsert("INSERT INTO kit_session_deletions (session_id,subject_id,stage,updated_at) VALUES (?,?,?,?)",
            "session_id", "stage", "updated_at"), sessionId, subjectId, stage, updatedAt);
    }

    public int markUsageDeleted(String deletedAt, String sessionId) {
        return db.run("UPDATE kit_session_usage SET deleted_at=? WHERE session_id=? AND finalized_at IS NOT NULL",
            deletedAt, sessionId);
    }

    public int deleteSession(String sessionId) {
        return db.run("DELETE FROM kit_sessions WHERE session_id=?", sessionId);
    }

    public int deleteDeletion(String sessionId) {
        return db.run("DELETE FROM kit_session_deletions WHERE session_id=?", sessionId);
    }

    public List<Row> listSessions(String subject, String slug, boolean includeArchived, String search,
                                  String cursorAt, String cursorId, int limit) {
        List<Object> args = new ArrayList<>();
        args.add(subject);
        StringBuilder where = new StringBuilder(" WHERE s.subject_id=? AND s.purpose='experience'");
        if (slug != null) {
            where.append(" AND s.agent_slug=?");
            args.add(slug);
        }
        if (!includeArchived) where.append(" AND (s.status IS NULL OR s.status!='archived')");
        if (search != null) {
            String filter = SqlPatterns.contains(search);
            where.append(" AND (LOWER(s.title) LIKE LOWER(?) ESCAPE '!' OR LOWER(s.agent_slug) LIKE LOWER(?) ESCAPE '!' " +
                "OR LOWER(c.display_name) LIKE LOWER(?) ESCAPE '!')");
            args.addAll(List.of(filter, filter, filter));
        }
        if (cursorAt != null) {
            where.append(" AND (COALESCE(s.last_event_at,s.created_at)<? OR (COALESCE(s.last_event_at,s.created_at)=? AND s.session_id<?))");
            args.addAll(List.of(cursorAt, cursorAt, cursorId));
        }
        args.add(limit);
        return db.all("SELECT s.* FROM kit_sessions s LEFT JOIN catalog_agents c ON c.slug=s.agent_slug" + where +
            " ORDER BY COALESCE(s.last_event_at,s.created_at) DESC,s.session_id DESC LIMIT ?", args.toArray());
    }
}
