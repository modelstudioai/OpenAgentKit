package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.SessionDao;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
final class SessionFiles {
    private final SessionDao dao;
    private final KitConfig config;
    private final GatewayClient gateway;
    private final SessionEvents events;

    SessionFiles(SessionDao dao, KitConfig config, GatewayClient gateway, SessionEvents events) {
        this.dao = dao;
        this.config = config;
        this.gateway = gateway;
        this.events = events;
    }

    boolean owned(String id, String subject, String purpose) {
        return dao.findUpload(id, subject, purpose) != null;
    }

    void requireUploads(List<JsonNode> files, String subject, String purpose) {
        for (JsonNode file : files) {
            if (!owned(file.path("file_id").asText(), subject, purpose)) throw KitError.missing("文件不存在");
        }
    }

    Object upload(RequestContext call, String purpose, FileUpload file) throws IOException {
        if (file.size > config.uploadLimit()) throw KitError.bodyTooLarge();
        String filename = file.filename;
        if (filename == null || filename.isBlank()) throw KitError.invalid("文件名无效");
        if (filename.toLowerCase(java.util.Locale.ROOT).endsWith(".mjs")) throw KitError.invalid("不支持的文件类型：.mjs");
        JsonNode saved = gateway.upload(filename,
            file.contentType == null ? "application/octet-stream" : file.contentType, file.bytes());
        if (!saved.path("file_id").isTextual()) throw KitError.provider("Provider 上传响应不完整");
        dao.insertUpload(saved.path("file_id").asText(), call.subject(), purpose, KitJson.now());
        return KitJson.data(saved);
    }

    Object status(RequestContext call) {
        String id = call.id("fileId");
        if (!owned(id, call.subject(), "experience")) throw KitError.missing("文件不存在");
        JsonNode value = gateway.call("fileStatus", id);
        return KitJson.data(KitJson.fields("file_id", id, "status", value.path("status").asText(null),
            "available", value.path("available").asBoolean()));
    }

    FileDownload download(RequestContext call, String purpose) {
        String id = call.id("fileId");
        if (!owned(id, call.subject(), purpose)) {
            String session = call.query("session_id");
            if (session == null || dao.findOwnedSessionId(session, call.subject(), purpose) == null || !artifact(session, id)) throw KitError.missing("文件不存在");
        }
        GatewayClient.Download response = gateway.download(id);
        String encoded = response.encodedFilename;
        String filename = encoded == null ? "download" : URLDecoder.decode(encoded, StandardCharsets.UTF_8);
        filename = filename.replaceAll("[\\x00-\\x1f\\x7f/\\\\]", "_");
        return new FileDownload(filename, response.contentType, response.bytes);
    }

    private boolean artifact(String session, String id) {
        for (JsonNode event : events.history(session)) {
            JsonNode metadata = event.path("metadata");
            for (JsonNode artifact : metadata.path("artifacts")) {
                if (id.equals(artifact.path("file_id").asText())) return true;
            }
            if (id.equals(metadata.path("artifact").path("file_id").asText())) return true;
        }
        return false;
    }

    static List<JsonNode> array(JsonNode array) {
        List<JsonNode> result = new ArrayList<>();
        if (array.isArray()) array.forEach(result::add);
        return result;
    }

    List<JsonNode> prepare(List<JsonNode> files, List<JsonNode> existing) {
        List<JsonNode> resolved = new ArrayList<>();
        Set<String> used = new HashSet<>();
        existing.forEach(file -> used.add(file.path("mount_path").asText()));
        for (int index = 0; index < files.size(); index++) {
            JsonNode file = files.get(index);
            String wanted = file.path("mount_path").asText("").trim();
            if (!wanted.startsWith("/")) {
                String name = file.path("filename").asText("").replace('\\', '/');
                name = name.substring(name.lastIndexOf('/') + 1).trim().replaceAll("^\\.+", "").replaceAll("\\s+", "_");
                wanted = "/mnt/session/uploads/" + (name.isEmpty() ? "file_" + (index + 1) : name);
            }
            String path = wanted;
            int suffix = wanted.lastIndexOf('.');
            if (suffix <= wanted.lastIndexOf('/')) suffix = wanted.length();
            for (int seq = 2; !used.add(path); seq++) path = wanted.substring(0, suffix) + "-" + seq + wanted.substring(suffix);
            ObjectNode copy = file.deepCopy();
            copy.put("mount_path", path);
            resolved.add(copy);
        }
        awaitScan(resolved);
        return resolved;
    }

    private void awaitScan(List<JsonNode> attachments) {
        Set<String> pending = new HashSet<>();
        attachments.forEach(file -> pending.add(file.path("file_id").asText()));
        long timeout = config.number("KIT_FILE_SCAN_TIMEOUT_MS", 20_000, 0, 600_000);
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeout);
        while (!pending.isEmpty()) {
            pending.removeIf(id -> gateway.call("fileStatus", id).path("available").asBoolean());
            if (pending.isEmpty()) return;
            if (System.nanoTime() >= deadline)
                throw new KitError("conflict", 409, "文件仍在安全扫描中，请稍后重试", true, null);
            pause(200);
        }
    }

    static void pause(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw KitError.provider("操作已取消");
        }
    }

    <T> T mounted(String session, List<JsonNode> files, java.util.function.Function<List<JsonNode>, T> work) {
        List<String> resources = new ArrayList<>();
        List<JsonNode> saved = new ArrayList<>();
        try {
            for (JsonNode file : files) {
                JsonNode result = gateway.call("mountSessionResource", session,
                    Map.of("fileId", file.path("file_id").asText(), "mountPath", file.path("mount_path").asText()));
                if (!result.path("resourceId").isTextual()) throw KitError.provider("文件挂载回执不完整");
                resources.add(result.path("resourceId").asText());
                ObjectNode entry = file.deepCopy();
                entry.put("mount_path", result.path("mountPath").asText(file.path("mount_path").asText()));
                saved.add(entry);
            }
            return work.apply(saved);
        } catch (RuntimeException error) {
            Collections.reverse(resources);
            for (String resource : resources) {
                try {
                    gateway.call("unmountSessionResource", session, resource);
                } catch (KitError ignored) {
                    // 单项回滚失败时继续清理已知的其他挂载。
                }
            }
            throw error;
        }
    }
}
