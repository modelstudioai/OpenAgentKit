package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class OperationDao {
    private final KitDatabase db;

    OperationDao(KitDatabase db) {
        this.db = db;
    }

    public Row findVisible(String operationId, String subject) {
        return db.one("SELECT * FROM kit_operations WHERE operation_id=? AND " +
            "(subject IS NULL OR subject=? OR kind!='resourceDraft.publish')", operationId, subject);
    }

    public List<Row> listVisible(String subject, int limit) {
        return db.all("SELECT * FROM kit_operations WHERE subject IS NULL OR subject=? OR kind!='resourceDraft.publish' " +
            "ORDER BY created_at DESC LIMIT ?", subject, limit);
    }
}
