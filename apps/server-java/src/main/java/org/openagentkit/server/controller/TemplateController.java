package org.openagentkit.server.controller;

import org.openagentkit.server.service.TemplateService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

@Component
final class TemplateController implements KitRoutes.Module {
    private static final String TEMPLATES = "/api/admin/templates";
    private static final String TEMPLATE = TEMPLATES + "/{templateId}";
    private final TemplateService template;

    TemplateController(TemplateService template) {
        this.template = template;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", TEMPLATES, call -> template.list(call.input));
        routes.add("POST", TEMPLATES, call -> ResponseEntity.status(201).body(template.save(call.input, false)));
        routes.add("GET", TEMPLATE, call -> template.detail(call.input.id("templateId")));
        routes.add("PUT", TEMPLATE, call -> template.save(call.input, true));
        routes.add("GET", TEMPLATE + "/versions", call -> template.versions(call.input));
        routes.add("GET", TEMPLATE + "/versions/{version}", call -> template.oneVersion(call.input));
        routes.add("POST", TEMPLATE + "/listing/plan", call -> template.listingPlan(call.input));
        routes.add("POST", TEMPLATE + "/listing", call -> template.applyListing(call.input));
        routes.add("POST", TEMPLATE + "/delete/plan", call -> template.deletionPlan(call.input));
        routes.add("DELETE", TEMPLATE, call -> template.delete(call.input));
    }
}
