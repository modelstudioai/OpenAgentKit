package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

@Repository
public class DraftDao {
    private final KitDatabase db;

    DraftDao(KitDatabase db) {
        this.db = db;
    }

    public Row findDraft(String draftId) {
        return db.one("SELECT * FROM kit_resource_drafts WHERE draft_id=? AND engine='yaml'", draftId);
    }

    public Row findActive(String owner) {
        return db.one("SELECT * FROM kit_resource_drafts WHERE owner=? AND engine='yaml' " +
            "AND (status!='published' OR cleanup_pending=1)", owner);
    }

    public int insertDraft(String draftId, String owner, String cleanupKeyHash, String createdAt, String updatedAt) {
        return db.run("INSERT INTO kit_resource_drafts (draft_id,owner,status,phase,engine,cleanup_key_hash,created_at,updated_at) " +
            "VALUES (?,?,'draft','editable','yaml',?,?,?)",
            draftId, owner, cleanupKeyHash, createdAt, updatedAt);
    }

    public int insertDocument(String draftId, String yaml) {
        return db.run("INSERT INTO kit_resource_draft_documents (draft_id,yaml) VALUES (?,?)", draftId, yaml);
    }

    public Row findDocument(String draftId) {
        return db.one("SELECT * FROM kit_resource_draft_documents WHERE draft_id=?", draftId);
    }

    public int updateDocument(String yaml, String assets, String draftId, long revision, String editableDraftId) {
        return db.run("UPDATE kit_resource_draft_documents SET yaml=?,assets_json=COALESCE(?,assets_json)," +
            "revision=revision+1 WHERE draft_id=? AND revision=? AND EXISTS " +
            "(SELECT 1 FROM kit_resource_drafts WHERE draft_id=? AND phase='editable' AND status!='published')",
            yaml, assets, draftId, revision, editableDraftId);
    }

    public int deletePlan(String draftId) {
        return db.run("DELETE FROM kit_resource_publish_plans WHERE draft_id=?", draftId);
    }

    public int touch(String updatedAt, String draftId) {
        return db.run("UPDATE kit_resource_drafts SET updated_at=? WHERE draft_id=?", updatedAt, draftId);
    }

    public int updateProof(String proofJson, String draftId) {
        return db.run("UPDATE kit_resource_draft_documents SET proof_json=? WHERE draft_id=?", proofJson, draftId);
    }

    public int savePublishedBindings(String bindingsJson, String updatedAt, String draftId) {
        return db.run("UPDATE kit_resource_drafts SET status='published',phase='succeeded',resources_json=?,cleanup_pending=1,updated_at=? " +
            "WHERE draft_id=?", bindingsJson, updatedAt, draftId);
    }

    public Row findProof(String draftId) {
        return db.one("SELECT proof_json FROM kit_resource_draft_documents WHERE draft_id=?", draftId);
    }

    public int deleteDocument(String draftId) {
        return db.run("DELETE FROM kit_resource_draft_documents WHERE draft_id=?", draftId);
    }

    public int completeCleanup(String updatedAt, String draftId) {
        return db.run("UPDATE kit_resource_drafts SET cleanup_pending=0,updated_at=? WHERE draft_id=?", updatedAt, draftId);
    }

    public int deleteEditable(String draftId) {
        return db.run("DELETE FROM kit_resource_drafts WHERE draft_id=? AND phase='editable'", draftId);
    }
}
