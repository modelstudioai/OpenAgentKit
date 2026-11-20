package org.openagentkit.server.controller;

import org.openagentkit.server.service.CatalogService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

@Component
final class CatalogController implements KitRoutes.Module {
    private static final String CATALOG = "/api/admin/agents";
    private final CatalogService catalog;

    CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", CATALOG, call -> catalog.list());
        routes.add("POST", CATALOG, call -> ResponseEntity.status(201).body(catalog.create(call.input)));
        routes.add("POST", CATALOG + "/{slug}/plan", call -> catalog.plan(call.input));
        routes.add("PATCH", CATALOG + "/{slug}", call -> catalog.listing(call.input));
        routes.add("PUT", CATALOG + "/{slug}", call -> catalog.update(call.input));
        routes.add("DELETE", CATALOG + "/{slug}", call -> catalog.remove(call.input));
    }
}
