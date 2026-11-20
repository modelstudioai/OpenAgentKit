package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BooleanSupplier;

@Service
final class SessionEvents {
    private static final int HISTORY_MAX = 50_000;
    private static final long HISTORY_BYTES = 64L * 1024 * 1024;
    private final GatewayClient gateway;
    private final KitJson json;

    SessionEvents(GatewayClient gateway, KitJson json) {
        this.gateway = gateway;
        this.json = json;
    }

    List<JsonNode> history(String id) {
        return history(id, () -> false);
    }

    List<JsonNode> history(String id, BooleanSupplier cancelled) {
        List<JsonNode> events = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        String token = null;
        long bytes = 0;
        do {
            if (cancelled.getAsBoolean()) throw KitError.provider("会话历史查询已取消");
            JsonNode page = gateway.call("listEvents", id, token == null ? Map.of("limit", 100)
                : Map.of("limit", 100, "pageToken", token));
            JsonNode sequence = page.path("events");
            if (!sequence.isArray()) throw KitError.provider("会话历史响应无效");
            for (JsonNode event : sequence) {
                bytes += size(event);
                events.add(event);
                if (events.size() > HISTORY_MAX || bytes > HISTORY_BYTES) {
                    throw KitError.provider("会话历史超过本次回放容量");
                }
            }
            token = page.path("next_page_token").asText(null);
            if (token != null && !seen.add(token)) throw KitError.provider("事件分页游标重复");
        } while (token != null && !token.isEmpty());
        return events;
    }

    int size(JsonNode event) {
        return json.write(event).getBytes(StandardCharsets.UTF_8).length;
    }

    static JsonNode merge(JsonNode previous, JsonNode incoming) {
        if (previous == null) return incoming;
        if (stage(previous).equals("completed") && stage(incoming).equals("in_progress")) return previous;
        if (!previous.isObject() || !incoming.isObject()) return incoming;
        ObjectNode result = ((ObjectNode) previous).deepCopy();
        result.setAll((ObjectNode) incoming);
        JsonNode metadata = incoming.path("metadata");
        if (metadata.isObject() && previous.path("metadata").isObject()) {
            ObjectNode combined = ((ObjectNode) previous.get("metadata")).deepCopy();
            combined.setAll((ObjectNode) metadata);
            result.set("metadata", combined);
        }
        return result.equals(previous) ? previous : result;
    }

    static Map<String, JsonNode> reconcile(List<JsonNode> history, List<JsonNode> live) {
        Map<String, JsonNode> previous = new LinkedHashMap<>();
        Map<String, JsonNode> buffered = new LinkedHashMap<>();
        int anonymous = 0;
        for (JsonNode event : history) {
            String key = event.path("event_id").asText("");
            if (key.isEmpty()) key = "#" + anonymous++;
            previous.put(key, merge(previous.get(key), event));
        }
        for (JsonNode event : live) {
            String key = event.path("event_id").asText("");
            if (key.isEmpty()) key = "#" + anonymous++;
            buffered.put(key, merge(buffered.get(key), event));
        }
        for (Map.Entry<String, JsonNode> entry : buffered.entrySet()) {
            JsonNode known = previous.get(entry.getKey());
            JsonNode current = merge(known, entry.getValue());
            if (known != null && current != known && !(stage(known).equals("in_progress")
                && stage(entry.getValue()).equals("completed"))) {
                throw KitError.provider("历史与实时快照的更新顺序无法确认，请重新连接后刷新");
            }
            previous.put(entry.getKey(), current);
        }
        return previous;
    }

    private static String stage(JsonNode event) {
        return event.path("metadata").path("event_status").asText();
    }

    static JsonNode data(JsonNode event) {
        for (JsonNode block : event.path("content")) {
            if ("data".equals(block.path("type").asText()) && block.path("data").isObject()) return block.get("data");
        }
        return MissingNode.getInstance();
    }

    static String thread(JsonNode event) {
        return event.path("session_thread_id").asText(event.path("metadata").path("session_thread_id").asText(""));
    }

    static String status(JsonNode event) {
        if (!"session_status".equals(event.path("type").asText()) || !thread(event).isEmpty()) return null;
        String value = data(event).path("session_status").asText(event.path("metadata").path("status").asText(null));
        JsonNode stop = data(event).has("stop_reason") ? data(event).get("stop_reason") : event.path("metadata").path("stop_reason");
        return "idle".equals(value) && "requires_action".equals(stop.asText(stop.path("type").asText())) ? "requires_action" : value;
    }

    static String latestStatus(List<JsonNode> events) {
        for (int index = events.size() - 1; index >= 0; index--) {
            String status = status(events.get(index));
            if (status != null) return status;
        }
        return null;
    }

    static boolean removed(String status) {
        return "terminated".equals(status) || "archived".equals(status) || "deleted".equals(status);
    }

    static boolean running(String status) {
        return "running".equals(status) || "rescheduling".equals(status);
    }
}
