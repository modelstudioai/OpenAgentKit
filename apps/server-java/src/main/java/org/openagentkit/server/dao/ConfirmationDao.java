package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

@Repository
public class ConfirmationDao {
    private final KitDatabase db;

    ConfirmationDao(KitDatabase db) {
        this.db = db;
    }

    public int deleteExpired(String now) {
        return db.run("DELETE FROM kit_confirmation_consumptions WHERE expires_at < ?", now);
    }

    public int insertConsumption(String tokenHash, String expiresAt) {
        return db.run("INSERT INTO kit_confirmation_consumptions (token_hash,expires_at) VALUES (?,?)",
            tokenHash, expiresAt);
    }
}
