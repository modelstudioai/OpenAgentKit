package org.openagentkit.server.controller;

import org.openagentkit.server.service.PresetService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

@Component
final class PresetController implements KitRoutes.Module {
    private static final String PRESETS = "/api/admin/preset-packs";
    private final PresetService preset;

    PresetController(PresetService preset) {
        this.preset = preset;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("POST", PRESETS + "/preview", call -> preset.previewPack(call.input.body));
        routes.add("POST", PRESETS, call -> ResponseEntity.status(201).body(preset.create(call.input.body)));
        routes.add("GET", PRESETS + "/{presetId}", call -> preset.get(call.input.id("presetId")));
        routes.add("GET", PRESETS, call -> preset.list(call.input));
        routes.add("GET", PRESETS + "/agents/{agentId}/resources", call -> {
            call.response.setHeader("Cache-Control", "no-store");
            return preset.resources(call.input.id("agentId"));
        });
    }
}
