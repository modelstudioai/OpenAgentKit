package org.openagentkit.server.controller;

import org.openagentkit.server.KitJson;
import org.openagentkit.server.service.UsageLimitService;
import org.springframework.stereotype.Component;

@Component
final class UsageLimitController implements KitRoutes.Module {
    private final UsageLimitService usageLimit;

    UsageLimitController(UsageLimitService usageLimit) {
        this.usageLimit = usageLimit;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", "/api/admin/usage-limits/policy", call -> KitJson.data(usageLimit.policy()));
        routes.add("PUT", "/api/admin/usage-limits/policy", call -> usageLimit.updatePolicy(call.input));
        routes.add("GET", "/api/kit/usage-limits", call -> {
            call.response.setHeader("Cache-Control", "no-store");
            return usageLimit.own(call.input);
        });
        registerLimits(routes, "/api/admin/members/{memberId}/usage-limit", "memberId", false);
        registerLimits(routes, "/api/admin/usage/templates/{templateId}/usage-limit", "templateId", true);
    }

    private void registerLimits(KitRoutes routes, String path, String parameter, boolean template) {
        routes.add("GET", path, call -> usageLimit.limits(call.input.id(parameter), template));
        routes.add("PUT", path, call -> usageLimit.updateLimits(call.input.id(parameter), template, call.input));
        routes.add("DELETE", path, call -> usageLimit.resetLimits(call.input.id(parameter), template));
    }
}
