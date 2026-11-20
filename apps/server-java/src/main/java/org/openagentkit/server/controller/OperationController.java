package org.openagentkit.server.controller;

import org.openagentkit.server.service.OperationService;
import org.springframework.stereotype.Component;

@Component
final class OperationController implements KitRoutes.Module {
    private static final String OPERATIONS = "/api/admin/operations";
    private final OperationService operation;

    OperationController(OperationService operation) {
        this.operation = operation;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", OPERATIONS, call -> operation.list(call.input.subject(), call.input.query.path("limit").asInt(50)));
        routes.add("GET", OPERATIONS + "/{operationId}", call -> operation.detail(call.input.id("operationId"), call.input.subject()));
        routes.add("GET", OPERATIONS + "/{operationId}/events", call -> {
            SseResponse stream = new SseResponse();
            operation.subscribe(call.input, stream);
            return stream.response(call.response);
        });
    }
}
