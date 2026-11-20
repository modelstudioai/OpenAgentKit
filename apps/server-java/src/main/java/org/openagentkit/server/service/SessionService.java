package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.SessionDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.support.Crypto;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public final class SessionService {
    private static final List<String> SUMMARY = List.of("slug", "display_name", "description", "icon", "opening_remarks", "category");
    private final SessionDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final GatewayClient gateway;
    private final SessionStreams streams;
    private final SessionEvents events;
    private final SessionFiles files;
    private final SessionDeletes deletes;
    private final Confirmations confirmations;
    private final Approvals approvals;
    private final UsageLimitService usage;
    private final Object[] mutations = new Object[256];
    private final Map<String, Long> reconciled = new ConcurrentHashMap<>();

    SessionService(SessionDao dao, KitTransactions transactions, KitJson json, GatewayClient gateway, SessionStreams streams, SessionEvents events,
                  SessionFiles files, SessionDeletes deletes, Confirmations confirmations, Approvals approvals, UsageLimitService usage) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.gateway = gateway;
        this.streams = streams;
        this.events = events;
        this.files = files;
        this.deletes = deletes;
        this.confirmations = confirmations;
        this.approvals = approvals;
        this.usage = usage;
        Arrays.setAll(mutations, index -> new Object());
    }

    List<Row> listed() {
        return dao.listAgents();
    }

    Row listed(String slug) {
        Row row = dao.findListedAgent(slug);
        if (row == null) throw KitError.missing("agent 不存在或未上架");
        return row;
    }

    Map<String, Object> agentSummary(Row row) {
        Map<String, Object> view = new LinkedHashMap<>();
        SUMMARY.forEach(key -> put(view, row, key));
        view.put("suggested_prompts", json.stored(row.get("suggested_prompts")));
        view.put("capabilities", json.stored(row.get("capabilities")));
        if (row.get("theme") != null) view.put("theme", json.stored(row.get("theme")));
        view.put("featured", row.yes("featured"));
        return view;
    }

    public Object agentDetail(RequestContext call) {
        Row row = listed(call.id("slug"));
        Map<String, Object> view = agentSummary(row);
        for (String key : List.of("id", "remote_agent_id", "remote_agent_version")) put(view, row, key);
        try {
            JsonNode resources = gateway.call("getRemoteAgentResources", row.text("remote_agent_id"));
            if (!resources.isNull()) view.put("resources", resources);
        } catch (KitError ignored) {
            // 基础目录资料仍可读。
        }
        JsonNode memories = json.stored(row.get("memory_stores_json"));
        if (!memories.isEmpty()) {
            try {
                JsonNode publicMemory = gateway.call("getAgentMemoryStores", memories);
                if (!publicMemory.isEmpty()) view.put("memory_stores", publicMemory);
            } catch (KitError ignored) {
                // Provider 读不到完整列表时省略投影。
            }
        }
        return KitJson.data(view);
    }

    public Object create(RequestContext call, String purpose) {
        boolean debug = purpose.equals("admin_debug");
        Row catalog = debug ? null : listed(call.value("agent_slug"));
        List<JsonNode> requested = SessionFiles.array(call.body.path("files"));
        List<JsonNode> attached = new ArrayList<>();
        String agent = debug ? call.value("remote_agent_id") : catalog.text("remote_agent_id");
        String environment = debug ? call.value("remote_environment_id") : catalog.text("remote_environment_id");
        Number version = debug ? (call.body.has("agent_version") ? call.body.get("agent_version").numberValue() : null)
            : (Number) catalog.get("agent_version");
        JsonNode memory = debug ? call.body.path("memory_stores") : json.stored(catalog.get("memory_stores_json"));
        JsonNode vaults = debug ? call.body.path("vault_ids") : json.stored(catalog.get("vault_ids_json"));
        if (debug) {
            if (!contains(gateway.call("listRemoteAgents"), "agent_id", agent)
                || version != null && gateway.call("getRemoteAgentVersion", agent, version).isNull()) {
                throw KitError.invalid("所选智能体不存在，请重新选择");
            }
            if (environment != null && !contains(gateway.call("listRemoteEnvironments"), "environment_id", environment))
                throw KitError.invalid("所选环境不存在，请重新选择");
            for (JsonNode file : requested) {
                String id = file.path("file_id").asText();
                if (gateway.call("getRemoteFile", id).isNull() && !files.owned(id, call.subject(), purpose))
                    throw KitError.invalid("所选文件不可访问");
            }
            verifyResources(memory, vaults);
        } else {
            files.requireUploads(requested, call.subject(), purpose);
            attached.addAll(SessionFiles.array(json.stored(catalog.get("files_json"))));
        }
        Set<String> selected = new HashSet<>();
        attached.forEach(file -> selected.add(file.path("file_id").asText()));
        requested.forEach(file -> { if (selected.add(file.path("file_id").asText())) attached.add(file); });
        if (attached.size() > 10) throw KitError.invalid("目录文件与本次附件合计不能超过 10 个");
        List<JsonNode> mounts = files.prepare(attached, List.of());
        Map<String, Object> input = KitJson.fields("agentId", agent);
        if (version != null) input.put("agentVersion", version);
        if (environment != null && !environment.isEmpty()) input.put("environmentId", environment);
        if (call.value("title") != null) input.put("title", call.value("title"));
        if (!memory.isEmpty()) input.put("memoryStores", memory);
        if (!vaults.isEmpty()) input.put("vaultIds", vaults);
        JsonNode result = gateway.call("createSession", input);
        String id = result.path("session_id").asText("");
        if (id.isEmpty()) throw KitError.provider("建会话回执不完整");
        try {
            return files.mounted(id, mounts, saved -> {
                String now = KitJson.now();
                Map<String, Object> runtime = KitJson.fields("memory_stores", SessionFiles.array(memory),
                    "vault_ids", SessionFiles.array(vaults));
                if (version != null) runtime.put("agent_version", version);
                dao.insertSession(id,
                    call.subject(),
                    purpose,
                    debug ? null : catalog.text("slug"),
                    agent,
                    debug ? "template" : null,
                    debug ? environment : null,
                    debug ? json.write(runtime) : null,
                    call.value("title"),
                    "idle",
                    now,
                    now,
                    saved.isEmpty() ? null : json.write(saved));
                if (debug) return KitJson.data(detail(owned(id, call.subject(), purpose), false));
                Map<String, Object> data = KitJson.fields("session_id", id, "agent_slug", catalog.text("slug"),
                    "status", result.path("status").asText("idle"), "created_at", now);
                if (!saved.isEmpty()) data.put("files", saved);
                return KitJson.data(data);
            });
        } catch (RuntimeException error) {
            try { gateway.call("deleteSession", id); } catch (RuntimeException ignored) { }
            throw error;
        }
    }

    void verifyResources(JsonNode memory, JsonNode vaults) {
        for (JsonNode store : memory) {
            if (gateway.call("getRemoteMemoryStore", store.path("memory_store_id").asText()).isNull())
                throw KitError.invalid("所选记忆库不可访问");
        }
        for (JsonNode vault : vaults) {
            if (gateway.call("getRemoteVault", vault.asText()).isNull()) throw KitError.invalid("所选密钥库不可访问");
        }
    }

    static boolean contains(JsonNode array, String key, String value) {
        for (JsonNode item : array) if (value.equals(item.path(key).asText())) return true;
        return false;
    }

    private Map<String, Object> detail(Row row, boolean queryRemote) {
        Map<String, Object> view = summary(row);
        boolean debug = row.text("purpose").equals("admin_debug");
        if (debug) {
            view.put("source", row.text("debug_source"));
            for (String key : List.of("project_name", "agent_key", "project_revision", "remote_agent_id", "remote_environment_id"))
                put(view, row, key);
            if (row.get("source_dirty") != null) view.put("source_dirty", row.yes("source_dirty"));
            json.stored(row.get("runtime_json")).fields().forEachRemaining(entry -> view.put(entry.getKey(), entry.getValue()));
        }
        JsonNode attached = json.stored(row.get("files_json"));
        if (debug || !attached.isEmpty()) view.put("files", SessionFiles.array(attached));
        JsonNode associations = json.stored(row.get("message_files_json"));
        if (!debug && !associations.isEmpty()) view.put("message_files", associations);
        if (queryRemote) {
            JsonNode remote = gateway.call("getSession", row.text("session_id"));
            if (remote.hasNonNull("status")) view.put("remote_status", remote.get("status"));
            if (!debug) {
                if (remote.hasNonNull("usage")) view.put("usage", remote.get("usage"));
                if (remote.hasNonNull("stats")) view.put("stats", remote.get("stats"));
            }
        }
        return view;
    }

    public Object sessionAgents(RequestContext call) {
        List<String> agents = dao.listRecentAgents(call.subject()).stream()
            .map(row -> row.text("agent_slug")).collect(Collectors.toList());
        return KitJson.data(agents);
    }

    public Object directory(RequestContext call) {
        String slug = call.query("agent_slug");
        String search = call.query("q");
        if (search != null) search = search.trim().toLowerCase(Locale.ROOT);
        if (search != null && search.isEmpty()) search = null;
        boolean includeArchived = !"false".equals(call.query("include_archived"));
        int limit = call.query.path("limit").asInt(50);
        String context = json.write(Arrays.asList(call.subject(), slug, includeArchived, search));
        String token = call.query("page_token");
        String cursorAt = null;
        String cursorId = null;
        if (token != null) {
            try {
                JsonNode decoded = json.stored(Crypto.decode(token));
                cursorAt = decoded.required("at").asText();
                cursorId = decoded.required("id").asText();
                if (!context.equals(decoded.path("context").asText()) || cursorId.isEmpty()) throw KitError.invalidRequest();
                Instant.parse(cursorAt);
            } catch (RuntimeException error) {
                throw KitError.invalid("会话分页游标无效或与当前查询不匹配，请重新查询");
            }
        }
        List<Row> rows = dao.listSessions(call.subject(), slug, includeArchived, search, cursorAt, cursorId, limit + 1);
        if (rows.size() > limit) rows.remove(rows.size() - 1);
        else limit = -1;
        List<Object> result = new ArrayList<>();
        for (Row row : rows) {
            reconcileRunning(row);
            result.add(summary(row));
        }
        Row last = rows.isEmpty() ? null : rows.get(rows.size() - 1);
        String next = limit < 0 || last == null ? null : Crypto.base64(json.write(Map.of("context", context,
            "at", last.getOrDefault("last_event_at", last.text("created_at")) == null ? last.text("created_at")
                : last.getOrDefault("last_event_at", last.text("created_at")), "id", last.text("session_id"))));
        return KitJson.fields("data", result, "next_page_token", next);
    }

    private void reconcileRunning(Row row) {
        if (!"running".equals(row.text("status")) || row.text("last_event_at") == null
            || Instant.parse(row.text("last_event_at")).plusSeconds(120).isAfter(Instant.now())) return;
        String id = row.text("session_id");
        if (streams.tracking(id)) return;
        long now = System.currentTimeMillis();
        if (now - reconciled.getOrDefault(id, 0L) < 60_000) return;
        if (reconciled.size() > 4096) reconciled.values().removeIf(time -> now - time > 60_000);
        reconciled.put(id, now);
        try {
            String detail = gateway.call("getSession", id).path("status").asText(null);
            if (detail == null || SessionEvents.running(detail)) return;
            String status = SessionEvents.latestStatus(events.history(id));
            if (status == null || SessionEvents.running(status)) return;
            if (dao.reconcileRunning(status, id) > 0)
                row.put("status", status);
        } catch (RuntimeException ignored) {
            // 未确认的运行态保留并等待下一次对账。
        }
    }

    static String like(String text) {
        return "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    public Object send(RequestContext call, String purpose) {
        return mutate(call, purpose, () -> {
            String id = call.id("sessionId");
            Row row = require(call, purpose);
            String request = call.value("client_message_id");
            String text = messageText(call);
            String digest = Crypto.digest(text);
            if (request != null) {
                Row receipt = dao.findSendReceipt(id, request);
                if (receipt != null) return replaySend(id, digest, receipt);
                Row historical = dao.findLegacySendReceipt(id, UsageLimitService.requestKey(request));
                if (historical != null) return replaySend(id, digest, historical);
            }
            if ("archived".equals(row.text("status"))) throw KitError.conflict("已归档会话不能发送消息");
            boolean debug = purpose.equals("admin_debug");
            List<JsonNode> requested = SessionFiles.array(call.body.path("attachments"));
            if (debug && !requested.isEmpty()) throw KitError.invalid("附件只能在新建调试会话时挂载");
            files.requireUploads(requested, call.subject(), purpose);
            SessionStreams.Pump pump = streams.ready(id);
            if ("requires_action".equals(SessionEvents.latestStatus(pump.snapshot()))) throw KitError.conflict("请先处理工具审批");
            Map<String, Object> send = KitJson.fields("text", text);
            if (request != null) send.put("clientMessageId", request);
            List<JsonNode> stored = SessionFiles.array(json.stored(row.get("files_json")));
            Set<String> ids = stored.stream().map(item -> item.path("file_id").asText()).collect(Collectors.toSet());
            List<JsonNode> fresh = files.prepare(requested.stream().filter(item -> !ids.contains(item.path("file_id").asText()))
                .collect(Collectors.toList()), stored);
            return files.mounted(id, fresh, mounted -> usage.serial(call.subject(), () ->
                persistedSend(call, row, pump, request, digest, send, stored, requested, mounted, debug)));
        });
    }

    private static String messageText(RequestContext call) {
        String text = call.value("text");
        if (text == null || text.isBlank()) throw KitError.invalid("消息正文不能为空");
        for (JsonNode skill : call.body.path("skills")) {
            String name = skill.asText();
            text = Pattern.compile("(^|\\s)/" + Pattern.quote(name) + "(?=\\s|$)", Pattern.UNICODE_CHARACTER_CLASS)
                .matcher(text).replaceAll("$1" + Matcher.quoteReplacement("[使用 Skill:" + name + "]"));
        }
        return text;
    }

    private Object replaySend(String id, String digest, Row receipt) {
        if (!digest.equals(receipt.text("request_hash"))) throw KitError.conflict("请求标识已用于其他内容，请重新发送");
        if (receipt.get("event_ids") == null) throw KitError.conflict("消息已受理或结果待核对");
        return accepted(id, json.stored(receipt.get("event_ids")));
    }

    private Object persistedSend(RequestContext call, Row row, SessionStreams.Pump pump, String request, String digest,
                                 Map<String, Object> input, List<JsonNode> stored, List<JsonNode> requested,
                                 List<JsonNode> mounted, boolean debug) {
        String id = row.text("session_id");
        pump.ensureWritable();
        if (!debug) usage.admit(call.identity, row);
        long before = pump.position();
        String accounting = request == null ? UUID.randomUUID().toString() : request;
        boolean memberTurn = !debug && call.identity.member != null;
        transactions.run(() -> {
            if (request != null) dao.insertSendReceipt(id, request, digest, KitJson.now());
            if (memberTurn) usage.startTurn(row, accounting, digest);
            return null;
        });
        JsonNode reply;
        try {
            reply = gateway.call("sendMessage", id, input).path("event_ids");
        } catch (KitError error) {
            transactions.run(() -> {
                if (request != null && error.details instanceof JsonNode && ((JsonNode) error.details).path("request_rejected").asBoolean()) {
                    dao.deleteSendReceipt(id, request);
                }
                if (memberTurn) usage.rejectTurn(id, accounting, error);
                return null;
            });
            throw error;
        }
        if (!reply.isArray()) throw KitError.provider("消息写入结果待核对");
        String now = KitJson.now();
        transactions.run(() -> {
            if (request != null) dao.acceptSendReceipt(json.write(reply), id, request);
            if (!debug) usage.recordTurn(row, request, now);
            if (memberTurn) usage.acceptTurn(id, accounting, reply);
            List<JsonNode> all = new ArrayList<>(stored);
            all.addAll(mounted);
            if (!requested.isEmpty() && !reply.isEmpty()) {
                Set<String> bound = requested.stream().map(entry -> entry.path("file_id").asText()).collect(Collectors.toSet());
                List<JsonNode> linked = all.stream().filter(entry -> bound.contains(entry.path("file_id").asText())).collect(Collectors.toList());
                List<JsonNode> previous = SessionFiles.array(json.stored(row.get("message_files_json")));
                previous.add(json.mapper.valueToTree(Map.of("event_ids", reply, "files", linked)));
                dao.updateFilesAndLinks(json.write(all), json.write(previous), id);
            } else if (!mounted.isEmpty()) dao.updateFiles(json.write(all), id);
            dao.noteAcceptedMessage(now, id);
            return null;
        });
        List<String> received = new ArrayList<>();
        reply.forEach(eventId -> received.add(eventId.asText()));
        pump.accepted(received, before);
        return accepted(id, reply);
    }

    public Object decision(RequestContext call, String purpose) {
        return mutate(call, purpose, () -> {
            Row row = require(call, purpose);
            if ("allow".equals(call.value("result")) && purpose.equals("experience")) usage.admitApproval(call.identity, row);
            return accepted(row.text("session_id"), approvals.respond(row.text("session_id"), call.body.deepCopy()));
        });
    }

    private static Object accepted(String id, JsonNode eventIds) {
        if (!eventIds.isArray()) throw KitError.provider("消息回执不完整");
        return KitJson.data(Map.of("session_id", id, "accepted", true, "event_ids", eventIds));
    }

    public Object rename(RequestContext call) {
        return mutate(call, "experience", () -> {
            String title = call.value("title");
            if (title == null || title.trim().isEmpty()) throw KitError.invalidRequest();
            dao.renameSession(title.trim(), call.id("sessionId"));
            return KitJson.data(summary(require(call, "experience")));
        });
    }

    public Object plan(RequestContext call, String purpose) {
        String id = require(call, purpose).text("session_id");
        String action = call.value("action");
        if (action == null) throw KitError.invalidRequest();
        boolean debug = purpose.equals("admin_debug");
        String planId = debug ? "debug_delete_" + java.util.UUID.randomUUID() : confirmations.id("sessplan", id + "_" + action);
        String operation = debug ? "debug.session.delete:" + id : "session." + action;
        Map<String, Object> diff = KitJson.fields("resource", "session:" + id, "action", action, "destructive", true);
        if (debug) diff.put("summary", "删除此调试会话及其本地索引，不修改 Agent 或上架目录");
        return KitJson.data(confirmations.plan(planId, operation, call.subject(), List.of(diff), true));
    }

    public Object archive(RequestContext call) {
        return mutate(call, "experience", () -> {
            String id = call.id("sessionId");
            confirmations.consume(call, "session.archive", "sessplan_" + id + "_archive_");
            gateway.call("archiveSession", id);
            dao.archiveSession(id);
            streams.done(id, "archived");
            return KitJson.data(Map.of("archived", true));
        });
    }

    public Object remove(RequestContext call, String purpose) {
        String id = call.id("sessionId");
        synchronized (lock(id)) {
            Row row = require(call, purpose);
            boolean debug = purpose.equals("admin_debug");
            confirmations.consume(call, debug ? "debug.session.delete:" + id : "session.delete",
                debug ? "debug_delete_" : "sessplan_" + id + "_delete_");
            deletes.delete(row, !debug && call.identity.member != null);
            streams.done(id, "deleted");
            return KitJson.data(Map.of("deleted", true));
        }
    }

    private Object mutate(RequestContext call, String purpose, Supplier<Object> work) {
        String id = call.id("sessionId");
        synchronized (lock(id)) {
            require(call, purpose);
            deletes.requireWritable(id);
            return work.get();
        }
    }

    private Object lock(String id) {
        return mutations[Math.floorMod(id.hashCode(), mutations.length)];
    }

    private Row require(RequestContext call, String purpose) {
        return owned(call.id("sessionId"), call.subject(), purpose);
    }

    private Row owned(String id, String subject, String purpose) {
        Row row = dao.findOwnedSession(id, subject, purpose);
        if (row == null) throw KitError.missing(purpose.equals("admin_debug") ? "调试会话不存在" : "会话不存在");
        return row;
    }

    static Map<String, Object> summary(Row row) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (String key : List.of("session_id", "agent_slug", "title", "status", "created_at", "last_event_at")) put(result, row, key);
        return result;
    }

    static void put(Map<String, Object> view, Row row, String key) {
        Object value = row.get(key);
        if (value != null) view.put(key, value);
    }

    private static Object eventPage(JsonNode response) {
        return KitJson.fields("data", response.path("events"), "next_page_token", response.path("next_page_token").asText(null));
    }

    private static Map<String, Object> options(RequestContext call) {
        Map<String, Object> options = new LinkedHashMap<>();
        if (call.query.has("limit")) options.put("limit", call.query.path("limit").asInt());
        if (call.query.has("page_token")) options.put("pageToken", call.query("page_token"));
        if (call.query.has("after_id")) options.put("afterId", call.query("after_id"));
        return options;
    }

    public Object agents() {
        return KitJson.data(listed().stream().map(this::agentSummary).collect(Collectors.toList()));
    }

    public Object session(RequestContext call, String purpose) {
        return KitJson.data(detail(require(call, purpose), true));
    }

    public void subscribe(RequestContext call, String purpose, EventSink sink) {
        streams.subscribe(require(call, purpose).text("session_id"), call, sink);
    }

    public Object events(RequestContext call, String purpose) {
        return eventPage(gateway.call("listEvents", require(call, purpose).text("session_id"), options(call)));
    }

    public Object threads(RequestContext call, String purpose) {
        return gateway.call("listThreads", require(call, purpose).text("session_id"), options(call));
    }

    public Object threadEvents(RequestContext call, String purpose) {
        return eventPage(gateway.call("listThreadEvents", require(call, purpose).text("session_id"), call.id("threadId"), options(call)));
    }

    public Object approvals(RequestContext call, String purpose) {
        return KitJson.data(approvals.state(require(call, purpose).text("session_id"), true));
    }

    public Object interrupt(RequestContext call, String purpose) {
        return mutate(call, purpose, () -> {
            gateway.call("interrupt", call.id("sessionId"));
            return KitJson.data(Map.of("interrupted", true));
        });
    }

    public Object fileStatus(RequestContext call) {
        return files.status(call);
    }

    public Object upload(RequestContext call, String purpose, FileUpload file) throws IOException {
        return files.upload(call, purpose, file);
    }

    public FileDownload download(RequestContext call, String purpose) {
        return files.download(call, purpose);
    }
}
