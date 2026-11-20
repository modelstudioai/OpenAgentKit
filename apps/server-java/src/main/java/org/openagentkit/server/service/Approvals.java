package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
final class Approvals {
    private final GatewayClient gateway;
    private final SessionEvents events;
    private final SessionStreams streams;
    private final KitJson json;
    private final Map<List<String>, String> submitted = new ConcurrentHashMap<>();

    Approvals(GatewayClient gateway, SessionEvents events, SessionStreams streams, KitJson json) {
        this.gateway = gateway;
        this.events = events;
        this.streams = streams;
        this.json = json;
    }

    ObjectNode state(String id, boolean refresh) {
        streams.ready(id);
        List<JsonNode> history = events.history(id);
        List<JsonNode> current = streams.current(id);
        List<JsonNode> state = new java.util.ArrayList<>(SessionEvents.reconcile(history, current).values());
        JsonNode stop = null;
        for (int index = state.size() - 1; index >= 0; index--) {
            JsonNode event = state.get(index);
            String status = SessionEvents.status(event);
            if (status == null) continue;
            if (status.equals("requires_action")) {
                JsonNode data = SessionEvents.data(event);
                stop = data.has("stop_reason") ? data.get("stop_reason") : event.path("metadata").path("stop_reason");
            }
            break;
        }
        String batch = stop == null ? null : stop.path("pending_batch_id").asText(null);
        Set<String> pending = new LinkedHashSet<>();
        if (stop != null) stop.path("pending_call_ids").forEach(node -> {
            if (node.isTextual() && !node.asText().isEmpty()) pending.add(node.asText());
        });
        submitted.keySet().removeIf(key -> key.get(0).equals(id)
            && (!key.get(1).equals(batch) || !pending.contains(key.get(2))));
        Map<String, ObjectNode> requests = new LinkedHashMap<>();
        Map<String, String> replies = new LinkedHashMap<>();
        for (JsonNode event : state) {
            JsonNode data = SessionEvents.data(event);
            String call = data.path("call_id").asText("");
            if (batch == null || !batch.equals(data.path("batch_id").asText()) || !pending.contains(call)) continue;
            String type = event.path("type").asText();
            if (type.equals("tool_approval_response")) {
                String result = data.path("result").asText("");
                if (Set.of("allow", "deny").contains(result)) replies.put(call, result);
            } else if (type.equals("tool_approval_request")) {
                ObjectNode request = json.object();
                request.put("batch_id", batch);
                request.put("call_id", call);
                request.put("request_event_id", event.path("event_id").asText(null));
                String name = data.path("name").asText("");
                String tool = data.path("tool_type").asText("unknown");
                JsonNode arguments = data.path("arguments");
                request.put("name", name.isEmpty() ? "未知工具" : name);
                request.put("tool_type", tool);
                request.set("arguments", arguments.isMissingNode() ? json.mapper.nullNode() : arguments);
                if (data.path("server_label").isTextual()) request.set("server_label", data.get("server_label"));
                if (!SessionEvents.thread(event).isEmpty()) request.put("session_thread_id", SessionEvents.thread(event));
                request.put("status", "pending");
                request.put("actionable", (tool.equals("builtin") || tool.equals("mcp")) && !name.isEmpty()
                    && (arguments.isContainerNode() || arguments.isTextual()));
                requests.put(call, request);
            }
        }
        ObjectNode result = json.object();
        result.put("requires_action", stop != null);
        result.put("batch_id", batch);
        ArrayNode target = result.putArray("requests");
        result.set("pending_call_ids", json.mapper.valueToTree(pending));
        requests.forEach((call, view) -> {
            List<String> key = List.of(id, batch, call);
            if (replies.containsKey(call)) {
                view.put("result", replies.get(call));
                view.put("status", "submitted");
                view.put("actionable", false);
            } else {
                String prior = submitted.get(key);
                if ("uncertain".equals(prior) && refresh) submitted.remove(key, prior);
                else if (prior != null) {
                    view.put("status", prior);
                    view.put("actionable", false);
                }
            }
            target.add(view);
        });
        return result;
    }

    JsonNode respond(String id, ObjectNode decision) {
        String batch = decision.path("batch_id").asText();
        String call = decision.path("call_id").asText();
        List<String> key = List.of(id, batch, call);
        if (submitted.containsKey(key)) throw KitError.conflict("审批已提交或正在确认结果，请刷新");
        ObjectNode snapshot = state(id, false);
        for (JsonNode request : snapshot.path("requests")) {
            if (!batch.equals(request.path("batch_id").asText()) || !call.equals(request.path("call_id").asText())
                || !request.path("actionable").asBoolean()) continue;
            if (request.has("session_thread_id")) decision.set("session_thread_id", request.get("session_thread_id"));
            try {
                JsonNode result = gateway.call("respondToolApproval", id, decision);
                submitted.put(key, "submitted");
                return result.path("event_ids");
            } catch (KitError error) {
                if (error.details instanceof JsonNode && ((JsonNode) error.details).path("request_rejected").asBoolean()) throw error;
                submitted.put(key, "uncertain");
                throw new KitError("provider_error", 502, "审批结果尚不确定，请先刷新查询");
            }
        }
        throw KitError.conflict("审批已过期、已处理或暂不支持，请刷新");
    }
}
