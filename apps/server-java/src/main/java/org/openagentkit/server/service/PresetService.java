package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.PresetDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public final class PresetService {
    private final PresetDao dao;
    private final KitJson json;
    private final GatewayClient gateway;
    private final ResourceMetadata metadata;

    PresetService(PresetDao dao, KitJson json, GatewayClient gateway, ResourceMetadata metadata) {
        this.dao = dao;
        this.json = json;
        this.gateway = gateway;
        this.metadata = metadata;
    }

    private ObjectNode preview(JsonNode input) {
        String id = input.path("remote_agent_id").asText();
        JsonNode agent = metadata.agent(id);
        long version = input.path("agent_version").asLong(agent.path("version").asLong());
        if (version < 1) throw KitError.invalid("所选智能体缺少可用版本");
        ObjectNode config = json.object().put("remote_agent_id", id).put("agent_version", version);
        ArrayNode files = config.putArray("files");
        ArrayNode memories = config.putArray("memory_stores");
        ArrayNode vaults = config.putArray("vault_ids");
        Map<String, List<JsonNode>> available = new HashMap<>();
        JsonNode chosen = input.path("resources");
        if (!chosen.isEmpty()) {
            JsonNode remote = gateway.call("getPresetPackAgentResources", id);
            for (JsonNode session : remote.path("sessions")) {
                for (JsonNode resource : session.path("resources")) {
                    String type = resource.path("type").asText();
                    String resourceId = resource.path(type + "_id").asText(resource.path("resource_id").asText(null));
                    if (resourceId == null) continue;
                    available.computeIfAbsent(type + ":" + resourceId, key -> new ArrayList<>()).add(resource);
                }
            }
        }
        Set<String> visited = new HashSet<>();
        for (JsonNode item : chosen) {
            String type = item.path("type").asText();
            String key = type + ":" + item.path("resource_id").asText();
            if (!visited.add(key)) throw KitError.invalid("同一资源不能重复选择");
            List<JsonNode> resources = available.get(key);
            if (resources == null) throw KitError.conflict("所选资源已变化或不属于当前智能体");
            JsonNode first = resources.get(0);
            switch (type) {
                case "environment":
                    if (config.has("remote_environment_id")) throw KitError.invalid("请选择一个环境");
                    config.put("remote_environment_id", required(first, "environment_id"));
                    break;
                case "file":
                    String path = compatible(resources, "mount_path", "所选文件存在多个挂载路径");
                    if (compatible(resources, "access", "所选文件权限不可兼容") != null)
                        throw KitError.invalid("所选文件包含当前配置无法保留的权限");
                    ObjectNode file = files.addObject().put("file_id", required(first, "file_id"));
                    if (path != null) file.put("mount_path", path);
                    break;
                case "memory_store":
                    String access = compatible(resources, "access", "所选记忆库存在不同访问权限");
                    memories.addObject().put("memory_store_id", required(first, "memory_store_id"))
                        .put("access", access == null ? "read_only" : access);
                    break;
                case "vault":
                    vaults.add(required(first, "vault_id"));
                    break;
                default:
                    throw KitError.invalid("所选资源类型无法用于创建配置");
            }
        }
        String envId = config.path("remote_environment_id").asText(null);
        JsonNode environment = metadata.environment(envId);
        ObjectNode prepared = metadata.prepare(config);
        prepared.put("remote_agent_name", agent.path("name").asText(id));
        if (!environment.isNull()) prepared.put("remote_environment_name", environment.path("name").asText(envId));
        return prepared;
    }

    private static String required(JsonNode node, String key) {
        String value = node.path(key).asText("");
        if (value.isEmpty()) throw KitError.invalid("所选资源缺少可复用的底层资源 ID");
        return value;
    }

    private static String compatible(List<JsonNode> resources, String key, String message) {
        Set<String> values = new HashSet<>();
        for (JsonNode node : resources) {
            String value = node.path(key).asText(null);
            if (value != null && !value.isEmpty()) values.add(value);
        }
        if (values.size() > 1) throw KitError.invalid(message);
        return values.stream().findFirst().orElse(null);
    }

    public Object list(RequestContext call) {
        String search = call.query.path("search").asText("").trim().toLowerCase(Locale.ROOT);
        int limit = call.query.path("limit").asInt(50);
        int offset = call.query.path("offset").asInt(0);
        long total = 0;
        List<Object> page = new ArrayList<>();
        for (Row row : dao.list()) {
            JsonNode config = json.stored(row.get("config_json"));
            if (!config.path("remote_agent_name").asText().toLowerCase(Locale.ROOT).contains(search)
                && !config.path("remote_agent_id").asText().toLowerCase(Locale.ROOT).contains(search)) continue;
            total++;
            if (total <= offset || page.size() >= limit) continue;
            page.add(KitJson.fields("preset_pack_id", row.text("preset_pack_id"), "created_at", row.text("created_at"),
                "remote_agent_id", config.get("remote_agent_id"), "remote_agent_name", config.get("remote_agent_name"),
                "agent_version", config.get("agent_version"), "resource_count", config.path("files").size() +
                    config.path("memory_stores").size() + config.path("vault_ids").size() + (config.hasNonNull("remote_environment_id") ? 1 : 0)));
        }
        return KitJson.fields("data", page, "total", total);
    }

    public Object previewPack(JsonNode input) {
        return KitJson.data(preview(input));
    }

    public Object create(JsonNode input) {
        ObjectNode config = preview(input);
        String id = "preset_" + UUID.randomUUID();
        String now = KitJson.now();
        dao.insert(id, json.write(config), now);
        return KitJson.data(config.put("preset_pack_id", id).put("created_at", now));
    }

    public Object get(String id) {
        Row row = dao.findById(id);
        if (row == null) throw KitError.missing("预设包不存在");
        ObjectNode config = json.stored(row.get("config_json")).deepCopy();
        return KitJson.data(config.put("preset_pack_id", row.text("preset_pack_id")).put("created_at", row.text("created_at")));
    }

    public Object resources(String agentId) {
        return KitJson.data(gateway.call("getPresetPackAgentResources", agentId));
    }
}
