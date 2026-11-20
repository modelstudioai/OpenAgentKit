package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Repository
public class MetaDao {
    private final KitDatabase db;

    MetaDao(KitDatabase db) {
        this.db = db;
    }

    public int initializeDefaultQuota(long monthlyCredits, String updatedAt, long expectedCredits) {
        return db.run("UPDATE quota_policy SET monthly_credits=?, updated_at=?, updated_by='config' " +
            "WHERE id=1 AND updated_at IS NULL AND monthly_credits<>?",
            monthlyCredits, updatedAt, expectedCredits);
    }

    public int appendAudit(String at, String subject, String action, String target, String detail) {
        return db.run("INSERT INTO kit_audit (at, subject, action, target, detail) VALUES (?,?,?,?,?)",
            at, subject, action, target, detail);
    }

    public int createDefaultBranding(String productName, String updatedAt) {
        return db.run(db.ignoreConflict("INSERT INTO kit_branding (id,product_name,updated_at) VALUES (1,?,?)", "id"),
            productName, updatedAt);
    }

    public Row findBranding() {
        return db.one("SELECT product_name,logo_url,updated_at,updated_by FROM kit_branding WHERE id=1");
    }

    public Row findLogoHash() {
        return db.one("SELECT hash FROM kit_branding_logo WHERE id=1");
    }

    public int updateProductName(String productName, String updatedAt, String updatedBy) {
        return db.run("UPDATE kit_branding SET product_name=?,updated_at=?,updated_by=? WHERE id=1",
            productName, updatedAt, updatedBy);
    }

    public int deleteLogo() {
        return db.run("DELETE FROM kit_branding_logo WHERE id=1");
    }

    public int updateBranding(String productName, String logoUrl, String updatedAt, String updatedBy) {
        return db.run("UPDATE kit_branding SET product_name=?,logo_url=?,updated_at=?,updated_by=? WHERE id=1",
            productName, logoUrl, updatedAt, updatedBy);
    }

    public int saveLogo(String contentType, byte[] bytes, String hash, String updatedAt) {
        return db.run(db.upsert("INSERT INTO kit_branding_logo (id,content_type,bytes,hash,updated_at) VALUES (1,?,?,?,?)",
            "id", "content_type", "bytes", "hash", "updated_at"),
            contentType, bytes, hash, updatedAt);
    }

    public int clearExternalLogoUrl(String updatedAt, String updatedBy) {
        return db.run("UPDATE kit_branding SET logo_url=NULL,updated_at=?,updated_by=? WHERE id=1", updatedAt, updatedBy);
    }

    public Row findLogo() {
        return db.one("SELECT content_type,bytes FROM kit_branding_logo WHERE id=1");
    }

    public long countAudit(String subject, List<String> actions) {
        List<Object> args = auditParameters(subject, actions);
        return db.one("SELECT COUNT(*) AS total" + auditFilter(actions), args.toArray()).integer("total");
    }

    public List<Row> listAudit(String subject, List<String> actions, int limit, int offset) {
        List<Object> args = auditParameters(subject, actions);
        args.add(limit);
        args.add(offset);
        return db.all("SELECT *" + auditFilter(actions) + " ORDER BY id DESC LIMIT ? OFFSET ?", args.toArray());
    }

    private static String auditFilter(List<String> actions) {
        return " FROM kit_audit WHERE subject=? AND action IN (" + String.join(",", Collections.nCopies(actions.size(), "?")) + ")";
    }

    private static List<Object> auditParameters(String subject, List<String> actions) {
        List<Object> args = new ArrayList<>();
        args.add(subject);
        args.addAll(actions);
        return args;
    }
}
