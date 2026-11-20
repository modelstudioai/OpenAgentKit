package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;

@Repository
public class QuotaDao {
    private final KitDatabase db;

    QuotaDao(KitDatabase db) {
        this.db = db;
    }

    public List<Row> recentAgents(String subjectId) {
        return db.all("SELECT agent_slug,MAX(COALESCE(last_event_at,created_at)) AS at FROM kit_sessions " +
            "WHERE subject_id=? AND purpose='experience' GROUP BY agent_slug", subjectId);
    }

    public List<Row> recentTurnsByAgent(String beginDay) {
        return db.all("SELECT agent_slug,COUNT(*) AS turns FROM usage_turns WHERE day>=? GROUP BY agent_slug", beginDay);
    }

    public List<Row> monthlyTurnsByAgent(String subjectId, String month) {
        return db.all("SELECT agent_slug,COUNT(*) AS turns FROM usage_turns WHERE subject_id=? AND month=? " +
            "GROUP BY agent_slug ORDER BY turns DESC,agent_slug", subjectId, month);
    }

    public List<Row> dailyTurns(String subjectId, String beginDay) {
        return db.all("SELECT day,COUNT(*) AS turns FROM usage_turns WHERE subject_id=? AND day>=? GROUP BY day",
            subjectId, beginDay);
    }

    public Row findPendingRequest(String subjectId) {
        return db.one("SELECT id FROM quota_request WHERE subject_id=? AND status='pending'", subjectId);
    }

    public int createRequest(String requestId, String subjectId, long requestedCredits, String reason, String createdAt) {
        return db.run("INSERT INTO quota_request (id,subject_id,requested_credits,reason,status,created_at) VALUES (?,?,?,?,'pending',?)",
            requestId, subjectId, requestedCredits, reason, createdAt);
    }

    public Row findPolicy() {
        return db.one("SELECT monthly_credits,updated_at,updated_by FROM quota_policy WHERE id=1");
    }

    public int saveOverride(String subjectId, long monthlyCredits, String reason, String updatedBy, String updatedAt) {
        return db.run(db.upsert("INSERT INTO quota_override (subject_id,monthly_credits,reason,updated_by,updated_at) VALUES (?,?,?,?,?)",
            "subject_id", "monthly_credits", "reason", "updated_by", "updated_at"),
            subjectId, monthlyCredits, reason, updatedBy, updatedAt);
    }

    public int insertPack(String packId, String subjectId, String month, long credits, String reason, String grantedBy, String createdAt) {
        return db.run("INSERT INTO quota_pack (id,subject_id,month,credits,reason,granted_by,created_at) VALUES (?,?,?,?,?,?,?)",
            packId, subjectId, month, credits, reason, grantedBy, createdAt);
    }

    public Row findRequest(String requestId) {
        return db.one("SELECT * FROM quota_request WHERE id=?", requestId);
    }

    public int reviewRequest(String status, String mode, Number credits, String note, String reviewedBy, String reviewedAt, String requestId) {
        return db.run("UPDATE quota_request SET status=?,mode=?,granted_credits=?,review_note=?,reviewed_by=?,reviewed_at=? WHERE id=?",
            status, mode, credits, note, reviewedBy, reviewedAt, requestId);
    }

    public List<Row> monthlyTurnsBySubject(String month) {
        return db.all("SELECT subject_id,COUNT(*) AS used FROM usage_turns WHERE month=? GROUP BY subject_id ORDER BY used DESC,subject_id",
            month);
    }

    public int updatePolicy(long monthlyCredits, String updatedAt, String updatedBy) {
        return db.run("UPDATE quota_policy SET monthly_credits=?,updated_at=?,updated_by=? WHERE id=1",
            monthlyCredits, updatedAt, updatedBy);
    }

    public List<Row> listOverrides() {
        return db.all("SELECT * FROM quota_override ORDER BY updated_at DESC,subject_id");
    }

    public Row findOverride(String subjectId) {
        return db.one("SELECT * FROM quota_override WHERE subject_id=?", subjectId);
    }

    public int deleteOverride(String subjectId) {
        return db.run("DELETE FROM quota_override WHERE subject_id=?", subjectId);
    }

    public int deletePack(String packId) {
        return db.run("DELETE FROM quota_pack WHERE id=?", packId);
    }

    public List<Row> listRequests(String id, String subjectId, String status) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (id != null) {
            where.append(" AND id=?");
            args.add(id);
        }
        if (subjectId != null) {
            where.append(" AND subject_id=?");
            args.add(subjectId);
        }
        if (status != null) {
            where.append(" AND status=?");
            args.add(status);
        }
        return db.all("SELECT * FROM quota_request" + where + " ORDER BY created_at DESC,id DESC", args.toArray());
    }
}
