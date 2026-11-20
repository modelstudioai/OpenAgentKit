package org.openagentkit.server.controller;

import org.openagentkit.server.service.DraftResourcesService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

@Component
final class DraftController implements KitRoutes.Module {
    private static final String DRAFTS = "/api/admin/resource-drafts";
    private static final String RESOURCES = DRAFTS + "/{name}/resources";
    private static final String DECLARATION = RESOURCES + "/declarations/{type}/{id}";
    private static final String KEY = "x-kit-draft-key";
    private final DraftResourcesService draftResources;

    DraftController(DraftResourcesService draftResources) {
        this.draftResources = draftResources;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", DRAFTS + "/active", call -> noStore(call, draftResources.active(call.input.subject(), call.request.getHeader(KEY))));
        routes.add("POST", DRAFTS, call -> noStore(call, draftResources.create(call.input.subject(), call.request.getHeader(KEY))));
        routes.add("GET", DRAFTS + "/{draftId}", call -> noStore(call, draftResources.draft(call.input.id("draftId"), call.input.subject())));
        routes.add("POST", DRAFTS + "/{draftId}/discard", call -> noStore(call, draftResources.discard(call.input, call.request.getHeader(KEY))));
        routes.add("POST", DRAFTS + "/{draftId}/finalize", call ->
            noStore(call, draftResources.finalizeDraft(call.input.id("draftId"), call.input.subject())));
        routes.add("GET", RESOURCES, call -> noStore(call, draftResources.overview(call.input)));
        routes.add("GET", RESOURCES + "/agent-options", call -> read(call, "agentOptions"));
        routes.add("GET", RESOURCES + "/memory-stores/{storeId}", call -> read(call, "memoryStoreConfiguration", call.input.id("storeId")));
        routes.add("GET", RESOURCES + "/resource-bindings", call -> noStore(call, draftResources.bindings(call.input)));
        routes.add("POST", RESOURCES + "/resource-bindings/resolve", call -> read(call, "resolveResourceBindings", call.input.body));
        routes.add("GET", RESOURCES + "/declarations", call -> read(call, "declarations"));
        routes.add("GET", DECLARATION, call -> read(call, "declaration", call.input.id("type"), call.input.id("id")));
        routes.add("POST", DECLARATION + "/preview", call ->
            read(call, "declarationPreview", call.input.id("type"), call.input.id("id"), call.input.body));
        routes.add("PUT", DECLARATION, call -> draftResources.modify(call.input, "putDeclaration",
            call.input.id("type"), call.input.id("id"), call.input.body));
        routes.add("DELETE", DECLARATION, call -> draftResources.modify(call.input, "deleteDeclaration",
            call.input.id("type"), call.input.id("id"), call.input.value("base_revision")));
        routes.add("POST", RESOURCES + "/validate", call -> read(call, "validate"));
        routes.add("POST", RESOURCES + "/plan", call -> noStore(call, draftResources.plan(call.input)));
        routes.add("POST", RESOURCES + "/publish", call -> ResponseEntity.accepted().body(draftResources.publish(call.input)));
        createRoute(routes, "agents", "createAgent");
        createRoute(routes, "environments", "createEnvironment");
        createRoute(routes, "vaults", "createVault");
        createRoute(routes, "memory-stores", "createMemoryStore");
        registerUploads(routes, "file");
        registerUploads(routes, "skill");
    }

    private void createRoute(KitRoutes routes, String path, String method) {
        routes.add("POST", RESOURCES + "/" + path, call ->
            ResponseEntity.status(201).body(draftResources.modify(call.input, method, call.input.body)));
    }

    private void registerUploads(KitRoutes routes, String kind) {
        String path = RESOURCES + "/" + kind + "-uploads";
        routes.add("POST", path, call -> ResponseEntity.status(201).body(draftResources.stage(call.input, kind,
            call.request.getParameter("base_revision"), Uploads.single(call.request))));
        routes.add("DELETE", path + "/{uploadId}", call -> draftResources.cancelUpload(call.input, kind));
        routes.add("POST", path + "/preview", call -> draftResources.uploadCommand(call.input, kind, false));
        routes.add("POST", path + "/commit", call -> draftResources.uploadCommand(call.input, kind, true));
    }

    private Object read(KitRoutes.Call call, String method, Object... args) {
        return noStore(call, draftResources.read(call.input, method, args));
    }

    private static Object noStore(KitRoutes.Call call, Object response) {
        call.response.setHeader("Cache-Control", "no-store");
        return response;
    }

}
