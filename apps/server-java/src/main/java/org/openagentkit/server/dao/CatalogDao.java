package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Repository
public class CatalogDao {
    private final KitDatabase db;

    CatalogDao(KitDatabase db) {
        this.db = db;
    }

    public Row findBySlug(String slug) {
        return db.one("SELECT * FROM catalog_agents WHERE slug=?", slug);
    }

    public Row findById(String id) {
        return db.one("SELECT * FROM catalog_agents WHERE id=?", id);
    }

    public int delete(String id) {
        return db.run("DELETE FROM catalog_agents WHERE id=?", id);
    }

    public List<Row> list() {
        return db.all("SELECT * FROM catalog_agents ORDER BY ordering,created_at");
    }

    public void insert(Map<String, Object> fields) {
        db.run("INSERT INTO catalog_agents (" + String.join(",", fields.keySet()) + ") VALUES (" +
            String.join(",", Collections.nCopies(fields.size(), "?")) + ")", fields.values().toArray());
    }

    public int update(String id, Map<String, Object> fields) {
        String set = fields.keySet().stream().map(key -> key + "=?").collect(Collectors.joining(","));
        List<Object> args = new ArrayList<>(fields.values());
        args.add(id);
        return db.run("UPDATE catalog_agents SET " + set + " WHERE id=?", args.toArray());
    }
}
