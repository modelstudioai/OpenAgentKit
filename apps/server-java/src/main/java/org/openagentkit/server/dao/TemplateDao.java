package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;

@Repository
public class TemplateDao {
    private static final String SELECT = "SELECT t.*,c.id AS catalog_id,c.slug AS catalog_slug,c.display_name AS catalog_display_name," +
        "c.status AS catalog_status,c.listed_at AS catalog_listed_at FROM kit_templates t LEFT JOIN kit_template_listings l " +
        "ON l.template_id=t.template_id LEFT JOIN catalog_agents c ON c.id=l.catalog_id";
    private final KitDatabase db;

    TemplateDao(KitDatabase db) {
        this.db = db;
    }

    public Row findTemplate(String templateId) {
        return db.one(SELECT + " WHERE t.template_id=?", templateId);
    }

    public int insertTemplate(String templateId, String name, String remoteAgentId, String remoteAgentName, String configJson, String createdAt, String updatedAt) {
        return db.run("INSERT INTO kit_templates (template_id,name,remote_agent_id,remote_agent_name,config_json,created_at,updated_at,version) " +
            "VALUES (?,?,?,?,?,?,?,1)",
            templateId, name, remoteAgentId, remoteAgentName, configJson, createdAt, updatedAt);
    }

    public int updateTemplate(String name, String remoteAgentId, String remoteAgentName, String configJson, String updatedAt, long version, String templateId, long baseVersion) {
        return db.run("UPDATE kit_templates SET name=?,remote_agent_id=?,remote_agent_name=?,config_json=?,updated_at=?,version=? " +
            "WHERE template_id=? AND version=?",
            name, remoteAgentId, remoteAgentName, configJson, updatedAt, version, templateId, baseVersion);
    }

    public int insertVersion(String templateId, long version, String configJson, String createdAt) {
        return db.run("INSERT INTO kit_template_versions (template_id,version,config_json,created_at) VALUES (?,?,?,?)",
            templateId, version, configJson, createdAt);
    }

    public List<Row> listVersions(String templateId, long before, int limit) {
        return db.all("SELECT * FROM kit_template_versions WHERE template_id=? AND version<? ORDER BY version DESC LIMIT ?",
            templateId, before, limit);
    }

    public Row findVersion(String templateId, long version) {
        return db.one("SELECT * FROM kit_template_versions WHERE template_id=? AND version=?", templateId, version);
    }

    public int saveListing(String templateId, String catalogId) {
        return db.run(db.upsert("INSERT INTO kit_template_listings (template_id,catalog_id) VALUES (?,?)", "template_id", "catalog_id"),
            templateId, catalogId);
    }

    public Row findConflictingListing(String displayName, String catalogId) {
        return db.one("SELECT id FROM catalog_agents WHERE display_name=? AND id<>?", displayName, catalogId);
    }

    public int deleteVersions(String templateId) {
        return db.run("DELETE FROM kit_template_versions WHERE template_id=?", templateId);
    }

    public int deleteListing(String templateId) {
        return db.run("DELETE FROM kit_template_listings WHERE template_id=?", templateId);
    }

    public int deleteTemplate(String templateId) {
        return db.run("DELETE FROM kit_templates WHERE template_id=?", templateId);
    }

    public int deleteCatalog(String catalogId) {
        return db.run("DELETE FROM catalog_agents WHERE id=?", catalogId);
    }

    public List<Row> list(String search, String status, String category, String cursorAt, String cursorId, int limit) {
        String pattern = SqlPatterns.contains(search);
        List<Object> args = new ArrayList<>(List.of(pattern, pattern, pattern));
        String query = SELECT + " WHERE (LOWER(t.name) LIKE ? ESCAPE '!' OR LOWER(t.remote_agent_id) LIKE ? ESCAPE '!' " +
            "OR LOWER(t.remote_agent_name) LIKE ? ESCAPE '!')";
        if (status != null) {
            query += " AND COALESCE(c.status,'unlisted')=?";
            args.add(status);
        }
        if (category != null) {
            String property;
            switch (db.dialect) {
                case MYSQL: property = "JSON_UNQUOTE(JSON_EXTRACT(t.config_json,'$.category'))"; break;
                case POSTGRES: property = "(CAST(t.config_json AS json)->>'category')"; break;
                default: property = "json_extract(t.config_json,'$.category')"; break;
            }
            query += " AND COALESCE(" + property + ",'general')=?";
            args.add(category);
        }
        if (cursorAt != null) {
            query += " AND (t.created_at<? OR (t.created_at=? AND t.template_id<?))";
            args.addAll(List.of(cursorAt, cursorAt, cursorId));
        }
        args.add(limit);
        return db.all(query + " ORDER BY t.created_at DESC,t.template_id DESC LIMIT ?", args.toArray());
    }
}
