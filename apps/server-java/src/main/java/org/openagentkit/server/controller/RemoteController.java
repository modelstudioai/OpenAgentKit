package org.openagentkit.server.controller;

import org.openagentkit.server.service.RemoteService;
import org.springframework.stereotype.Component;

@Component
final class RemoteController implements KitRoutes.Module {
    private static final String REMOTE = "/api/admin/remote";
    private final RemoteService remote;

    RemoteController(RemoteService remote) {
        this.remote = remote;
    }

    @Override
    public void register(KitRoutes routes) {
        list(routes, "agents", "listRemoteAgents");
        list(routes, "environments", "listRemoteEnvironments");
        list(routes, "files", "listRemoteFiles");
        list(routes, "vaults", "listRemoteVaults");
        list(routes, "memory-stores", "listRemoteMemoryStores");
        routes.add("GET", REMOTE + "/skills", call -> remote.list("listRemoteSkills", call.input.query.path("source").asText("workspace")));
        routes.add("GET", REMOTE + "/agents/{agentId}/versions", call -> remote.list("listRemoteAgentVersions", call.input.id("agentId")));
        routes.add("GET", REMOTE + "/agents/{agentId}/versions/{version}", call ->
            remote.agentVersion(call.input.id("agentId"), call.input.id("version")));
        routes.add("GET", REMOTE + "/environments/{environmentId}", call -> remote.get("getRemoteEnvironment", call.input.id("environmentId")));
        routes.add("GET", REMOTE + "/vaults/{vaultId}", call -> remote.get("getRemoteVaultDetail", call.input.id("vaultId")));
        routes.add("GET", REMOTE + "/memory-stores/{storeId}", call -> {
            call.response.setHeader("Cache-Control", "no-store");
            return remote.get("getRemoteMemoryStoreConfiguration", call.input.id("storeId"));
        });
    }

    private void list(KitRoutes routes, String path, String method) {
        routes.add("GET", REMOTE + "/" + path, call -> remote.list(method));
    }
}
