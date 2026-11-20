package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class PresetDao {
    private final KitDatabase db;

    PresetDao(KitDatabase db) {
        this.db = db;
    }

    public List<Row> list() {
        return db.all("SELECT * FROM kit_preset_packs ORDER BY created_at DESC,preset_pack_id DESC");
    }

    public int insert(String packId, String configJson, String createdAt) {
        return db.run("INSERT INTO kit_preset_packs (preset_pack_id,config_json,created_at) VALUES (?,?,?)",
            packId, configJson, createdAt);
    }

    public Row findById(String packId) {
        return db.one("SELECT * FROM kit_preset_packs WHERE preset_pack_id=?", packId);
    }
}
