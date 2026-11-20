package org.openagentkit.server.controller;

import org.openagentkit.server.KitJson;
import org.openagentkit.server.service.EvaluationService;
import org.springframework.stereotype.Component;

@Component
final class EvaluationController implements KitRoutes.Module {
    private final EvaluationService evaluation;

    EvaluationController(EvaluationService evaluation) {
        this.evaluation = evaluation;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", "/api/admin/eval/workspaces", call -> KitJson.data(evaluation.workspaces()));
        routes.add("GET", "/api/admin/eval/runs", call -> evaluation.list(call.input.query("workspace")));
        routes.add("GET", "/api/admin/eval/runs/{runId}", call -> evaluation.detail(call.input.query("workspace"), call.input.id("runId")));
    }
}
