package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

@Component
public final class KitTransactions {
    private final KitDatabase db;

    KitTransactions(KitDatabase db) {
        this.db = db;
    }

    public <T> T run(Supplier<T> work) {
        return db.tx(work);
    }
}
