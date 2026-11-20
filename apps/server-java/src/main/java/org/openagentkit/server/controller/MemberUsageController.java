package org.openagentkit.server.controller;

import org.openagentkit.server.service.MemberUsageService;
import org.springframework.stereotype.Component;

@Component
final class MemberUsageController implements KitRoutes.Module {
    private final MemberUsageService memberUsage;

    MemberUsageController(MemberUsageService memberUsage) {
        this.memberUsage = memberUsage;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", "/api/admin/usage/templates", call -> memberUsage.templateStats(call.input.query("search")));
        routes.add("GET", "/api/admin/usage/templates/{templateId}/sessions", call ->
            memberUsage.page(call.input.id("templateId"), null, call.input, true));
        routes.add("GET", "/api/admin/usage/templates/daily-trend", call -> memberUsage.daily(call.input));
        routes.add("GET", "/api/admin/usage/model-usage", call -> memberUsage.telemetry(call.input, "listModelUsage"));
        routes.add("GET", "/api/admin/usage/tool-usage", call -> memberUsage.telemetry(call.input, "listToolUsage"));
    }
}
