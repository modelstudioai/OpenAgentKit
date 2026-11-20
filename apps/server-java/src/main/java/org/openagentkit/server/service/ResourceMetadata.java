package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
final class ResourceMetadata {
    private final GatewayClient gateway;
    private final KitJson json;

    ResourceMetadata(GatewayClient gateway, KitJson json) {
        this.gateway = gateway;
        this.json = json;
    }

    ObjectNode prepare(ObjectNode input) {
        ObjectNode prepared = input.deepCopy();
        if (input.hasNonNull("agent_version")) version(input.path("remote_agent_id").asText(), input.path("agent_version").asLong());
        if (input.has("files")) prepared.set("files", files(input.get("files")));
        if (input.has("memory_stores")) prepared.set("memory_stores", memory(input.get("memory_stores")));
        if (input.has("vault_ids")) prepared.set("vault_ids", vaults(input.get("vault_ids")));
        return prepared;
    }

    void version(String agent, long version) {
        if (agent.isBlank() || version < 1 || gateway.call("getRemoteAgentVersion", agent, version).isNull())
            throw KitError.invalid("所选智能体版本不存在或已不可用，请重新选择");
    }

    JsonNode agent(String id) {
        for (JsonNode agent : gateway.call("listRemoteAgents")) {
            if (id.equals(agent.path("agent_id").asText())) return agent;
        }
        throw KitError.invalid("所选智能体不存在或不可访问");
    }

    JsonNode environment(String id) {
        if (id == null) return json.mapper.nullNode();
        for (JsonNode environment : gateway.call("listRemoteEnvironments")) {
            if (id.equals(environment.path("environment_id").asText())) return environment;
        }
        throw KitError.invalid("所选环境不存在或不可访问");
    }

    private ArrayNode files(JsonNode items) {
        if (!items.isArray() || items.size() > 10) throw KitError.invalid("最多选择 10 个文件");
        ArrayNode output = json.mapper.createArrayNode();
        Set<String> ids = new HashSet<>();
        Set<String> paths = new HashSet<>();
        for (JsonNode item : items) {
            String id = item.path("file_id").asText().trim();
            if (id.isEmpty() || !ids.add(id)) throw KitError.invalid("请选择不同的已上传文件");
            JsonNode remote = gateway.call("getRemoteFile", id);
            if (remote.isNull()) throw KitError.invalid("所选文件不存在或不是已上传文件");
            if (!remote.path("available").asBoolean()) throw KitError.conflict("所选文件尚不可用，请刷新文件列表");
            String name = remote.path("filename").asText("");
            String path = item.path("mount_path").asText("").trim();
            if (path.isEmpty()) path = "/mnt/session/uploads/" + safeName(name);
            else {
                if (!path.startsWith("/") || path.endsWith("/") || path.matches("(?s).*\\p{Cc}.*")
                    || List.of(path.split("/")).contains("..")) throw KitError.invalid("挂载路径必须是合法的绝对文件路径");
                path = Path.of(path).normalize().toString();
                if (path.equals("/")) throw KitError.invalid("挂载路径必须包含文件名");
            }
            if (!paths.add(path)) throw KitError.invalid("文件挂载路径不能重复");
            ObjectNode saved = output.addObject();
            saved.put("file_id", remote.path("file_id").asText(id)).put("filename", name).put("mount_path", path);
            if (remote.hasNonNull("size")) saved.set("size", remote.get("size"));
        }
        return output;
    }

    private static String safeName(String name) {
        String path = name.replace('\\', '/');
        String last = path.substring(path.lastIndexOf('/') + 1).trim().replaceAll("^\\.+", "").replaceAll("\\s+", "_");
        return last.isEmpty() ? "file_1" : last;
    }

    private ArrayNode memory(JsonNode items) {
        if (!items.isArray() || items.size() > 8) throw KitError.invalid("最多选择 8 个记忆库");
        ArrayNode output = json.mapper.createArrayNode();
        Set<String> ids = new HashSet<>();
        for (JsonNode item : items) {
            String id = item.path("memory_store_id").asText().trim();
            if (id.isEmpty() || !ids.add(id)) throw KitError.invalid("请选择不同的记忆库");
            JsonNode remote = gateway.call("getRemoteMemoryStore", id);
            if (remote.isNull()) throw KitError.invalid("所选记忆库不存在或已归档");
            ObjectNode value = output.addObject().put("memory_store_id", remote.path("memory_store_id").asText(id))
                .put("access", item.path("access").asText("read_only"));
            String instructions = item.path("instructions").asText("").trim();
            if (!instructions.isEmpty()) value.put("instructions", instructions);
        }
        return output;
    }

    private ArrayNode vaults(JsonNode items) {
        if (!items.isArray() || items.size() > 10) throw KitError.invalid("最多选择 10 个密钥库");
        ArrayNode output = json.mapper.createArrayNode();
        Set<String> ids = new HashSet<>();
        for (JsonNode item : items) {
            String id = item.asText().trim();
            if (!id.matches("[A-Za-z0-9_-]+") || !ids.add(id)) throw KitError.invalid("密钥库重复或 ID 无效");
            JsonNode remote = gateway.call("getRemoteVault", id);
            if (remote.isNull()) throw KitError.invalid("所选密钥库不存在或已归档");
            output.add(remote.path("vault_id").asText(id));
        }
        return output;
    }
}
