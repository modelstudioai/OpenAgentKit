package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class PublicationDao {
    private final KitDatabase db;

    PublicationDao(KitDatabase db) {
        this.db = db;
    }

    public List<Row> listInterruptedLegacyOperations() {
        return db.all("SELECT o.* FROM kit_operations o LEFT JOIN kit_sdk_operation_claims c ON c.operation_id=o.operation_id " +
            "WHERE c.operation_id IS NULL AND o.status IN ('pending','running')");
    }

    public int interruptLegacyOperation(String message, String publicationJson, String errorDetailsJson, String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET status='failed',phase='interrupted',error=?,publication_json=?,error_details_json=?," +
            "updated_at=? WHERE operation_id=?",
            message, publicationJson, errorDetailsJson, updatedAt, operationId);
    }

    public int markLegacyDraftUncertain(String updatedAt, String operationId) {
        return db.run("UPDATE kit_resource_drafts SET status='failed',phase='uncertain',updated_at=? " +
            "WHERE operation_id=? AND status='publishing'", updatedAt, operationId);
    }

    public int savePlan(String draftId, String planId, String planJson, Object expiresAt) {
        return db.run(db.upsert("INSERT INTO kit_resource_publish_plans (draft_id,plan_id,plan_json,expires_at) VALUES (?,?,?,?)",
            "draft_id", "plan_id", "plan_json", "expires_at"), draftId, planId, planJson, expiresAt);
    }

    public Row findPlan(String draftId) {
        return db.one("SELECT * FROM kit_resource_publish_plans WHERE draft_id=?", draftId);
    }

    public int insertOperation(String operationId, String kind, String subject, String createdAt, String updatedAt) {
        return db.run("INSERT INTO kit_operations (operation_id,kind,subject,status,phase,progress,log,created_at,updated_at) " +
            "VALUES (?,?,?,'pending','prepare',0,'[]',?,?)",
            operationId, kind, subject, createdAt, updatedAt);
    }

    public int insertClaim(String operationId, String draftId, String planJson, String updatedAt) {
        return db.run("INSERT INTO kit_sdk_operation_claims (operation_id,draft_id,plan_json,updated_at) VALUES (?,?,?,?)",
            operationId, draftId, planJson, updatedAt);
    }

    public int markDraftPublishing(String operationId, String expectedRevision, String updatedAt, String draftId) {
        return db.run("UPDATE kit_resource_drafts SET operation_id=?,expected_revision=?,status='publishing'," +
            "phase='executing',updated_at=? WHERE draft_id=? AND phase='editable'",
            operationId, expectedRevision, updatedAt, draftId);
    }

    public int deletePlan(String draftId) {
        return db.run("DELETE FROM kit_resource_publish_plans WHERE draft_id=?", draftId);
    }

    public int claim(String nodeInstance, String updatedAt, String operationId) {
        return db.run("UPDATE kit_sdk_operation_claims SET node_instance=?,updated_at=? " +
            "WHERE operation_id=? AND node_instance IS NULL", nodeInstance, updatedAt, operationId);
    }

    public int markRunning(String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET status='running',phase='plan',progress=0.1,updated_at=? WHERE operation_id=?",
            updatedAt, operationId);
    }

    public int grantWrites(String updatedAt, String operationId) {
        return db.run("UPDATE kit_sdk_operation_claims SET mutation_granted=1,updated_at=? WHERE operation_id=?",
            updatedAt, operationId);
    }

    public int markExecuting(String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET phase='executing',progress=0.2,updated_at=? WHERE operation_id=?",
            updatedAt, operationId);
    }

    public Row findCheckpoint(String operationId, long sequence) {
        return db.one("SELECT payload_hash FROM kit_sdk_checkpoints WHERE operation_id=? AND sequence=?",
            operationId, sequence);
    }

    public Row latestSequence(String operationId) {
        return db.one("SELECT COALESCE(MAX(sequence),0) AS n FROM kit_sdk_checkpoints WHERE operation_id=?", operationId);
    }

    public int insertCheckpoint(String operationId, long sequence, String payloadHash) {
        return db.run("INSERT INTO kit_sdk_checkpoints (operation_id,sequence,payload_hash) VALUES (?,?,?)",
            operationId, sequence, payloadHash);
    }

    public int touchClaim(String updatedAt, String operationId) {
        return db.run("UPDATE kit_sdk_operation_claims SET updated_at=? WHERE operation_id=?", updatedAt, operationId);
    }

    public int markCleanupFailure(String message, String errorDetailsJson, String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET status='failed',phase='cleanup',error=?,error_details_json=?,updated_at=? " +
            "WHERE operation_id=?", message, errorDetailsJson, updatedAt, operationId);
    }

    public int saveSdkState(String sdkStateJson, String draftId) {
        return db.run("UPDATE kit_resource_draft_documents SET sdk_state_json=? WHERE draft_id=?", sdkStateJson, draftId);
    }

    public int saveProviderResult(String publicationJson, String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET publication_json=?,progress=0.75,phase='provider_result',updated_at=? WHERE operation_id=?",
            publicationJson, updatedAt, operationId);
    }

    public int markSavingReceipt(String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET progress=0.8,phase='saving_receipt',updated_at=? WHERE operation_id=?",
            updatedAt, operationId);
    }

    public int saveResult(String resultJson, String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET progress=0.95,phase='cleanup',result=?,updated_at=? WHERE operation_id=?",
            resultJson, updatedAt, operationId);
    }

    public List<Row> listActiveClaims() {
        return db.all("SELECT o.operation_id,c.draft_id,c.node_instance,c.updated_at FROM kit_operations o " +
            "JOIN kit_sdk_operation_claims c ON c.operation_id=o.operation_id WHERE o.status IN ('pending','running')");
    }

    public int markSucceeded(String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET status='succeeded',phase='succeeded',progress=1,updated_at=? " +
            "WHERE operation_id=? AND status='running'", updatedAt, operationId);
    }

    public int markRunningCleanupFailure(String message, String errorDetailsJson, String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET status='failed',phase='cleanup',error=?,error_details_json=?,updated_at=? " +
            "WHERE operation_id=? AND status='running'",
            message, errorDetailsJson, updatedAt, operationId);
    }

    public int markFailed(String phase, String message, String publicationJson, String errorDetailsJson, String updatedAt, String operationId) {
        return db.run("UPDATE kit_operations SET status='failed',phase=?,error=?,publication_json=?,error_details_json=?,updated_at=? " +
            "WHERE operation_id=?",
            phase, message, publicationJson, errorDetailsJson, updatedAt, operationId);
    }

    public int markDraftFailed(String phase, String updatedAt, String draftId) {
        return db.run("UPDATE kit_resource_drafts SET status='failed',phase=?,updated_at=? WHERE draft_id=? AND status!='published'",
            phase, updatedAt, draftId);
    }

    public Row findSdkState(String draftId) {
        return db.one("SELECT sdk_state_json FROM kit_resource_draft_documents WHERE draft_id=?", draftId);
    }

    public Row findClaim(String operationId) {
        return db.one("SELECT o.status,c.* FROM kit_sdk_operation_claims c JOIN kit_operations o " +
            "ON c.operation_id=o.operation_id WHERE c.operation_id=?", operationId);
    }
}
