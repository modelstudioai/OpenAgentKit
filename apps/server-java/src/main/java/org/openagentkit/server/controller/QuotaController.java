package org.openagentkit.server.controller;

import org.openagentkit.server.KitJson;
import org.openagentkit.server.service.QuotaService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

@Component
final class QuotaController implements KitRoutes.Module {
    private static final String KIT = "/api/kit/quota";
    private static final String ADMIN = "/api/admin/quota";
    private final QuotaService quota;

    QuotaController(QuotaService quota) {
        this.quota = quota;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", "/api/kit/plaza", call -> quota.plaza(call.input));
        routes.add("GET", KIT, call -> quota.quotaView(call.input));
        routes.add("GET", KIT + "/requests", call -> quota.requestsForMember(call.input.subject()));
        routes.add("POST", KIT + "/requests", call -> ResponseEntity.status(201).body(quota.createRequest(call.input)));
        routes.add("GET", ADMIN + "/policy", call -> KitJson.data(quota.policy()));
        routes.add("PUT", ADMIN + "/policy", call -> quota.updatePolicy(call.input));
        routes.add("GET", ADMIN + "/overrides", call -> quota.overrides());
        routes.add("PUT", ADMIN + "/overrides/{subjectId}", call -> quota.updateOverride(call.input));
        routes.add("DELETE", ADMIN + "/overrides/{subjectId}", call -> quota.deleteOverride(call.input.id("subjectId")));
        routes.add("POST", ADMIN + "/packs", call -> ResponseEntity.status(201).body(quota.createPack(call.input)));
        routes.add("DELETE", ADMIN + "/packs/{packId}", call -> quota.deletePack(call.input.id("packId")));
        routes.add("GET", ADMIN + "/requests", call -> quota.requestsForAdmin(call.input.query("status")));
        routes.add("POST", ADMIN + "/requests/{id}/review", call -> quota.review(call.input));
        routes.add("GET", ADMIN + "/usage", call -> quota.usage(call.input));
    }
}
