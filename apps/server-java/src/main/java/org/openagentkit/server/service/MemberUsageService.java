package org.openagentkit.server.service;

import static org.openagentkit.server.dao.MemberUsageDao.METRICS;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.MemberUsageDao;
import org.openagentkit.server.dao.UsageLimitDao.Aggregate;
import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.support.Crypto;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import javax.annotation.PreDestroy;

@Service
public final class MemberUsageService {
    private static final List<String> TOKENS = List.of("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens");
    private static final List<String> TIMES = List.of("active_seconds", "duration_seconds");
    private final MemberUsageDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final GatewayClient gateway;
    private final KitConfig config;
    private final UsageLimitService ledger;
    private final ThreadPoolExecutor collectors = new ThreadPoolExecutor(4, 4, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(64));
    private final Set<String> running = ConcurrentHashMap.newKeySet();
    private final Map<String, Long> last = new ConcurrentHashMap<>();

    MemberUsageService(MemberUsageDao dao, KitTransactions transactions, KitJson json, GatewayClient gateway, KitConfig config, UsageLimitService ledger) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.gateway = gateway;
        this.config = config;
        this.ledger = ledger;
    }

    Map<String, Object> summary(String member, String slug, boolean force) {
        sync(member);
        if (force) refresh(member);
        Map<String, Object> view = aggregate(member, slug);
        view.put("agents", dao.listAgentSlugs(member)
            .stream().map(row -> row.text("agent_slug")).collect(Collectors.toList()));
        if (running.contains(member)) view.put("refresh_status", "refreshing");
        return view;
    }

    private void sync(String member) {
        transactions.run(() -> {
            for (Row row : dao.listUnrecordedSessions(member)) {
                dao.insertSessionUsage(row.text("session_id"),
                    member,
                    row.text("agent_slug"),
                    row.text("title"),
                    row.text("status"),
                    row.text("created_at"));
            }
            return null;
        });
    }

    private void refresh(String member) {
        long now = System.currentTimeMillis();
        if (now - last.getOrDefault(member, 0L) < 3000 || !running.add(member)) return;
        last.put(member, now);
        if (last.size() > 4096) last.values().removeIf(value -> now - value > 3000);
        try {
            collectors.execute(() -> {
                try {
                    for (Row row : dao.listUnfinalizedSessions(member)) {
                        collect(row.text("session_id"));
                    }
                } finally {
                    running.remove(member);
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            running.remove(member);
        }
    }

    private void collect(String session) {
        String now = KitJson.now();
        try {
            JsonNode detail = gateway.call("getSession", session);
            if (detail.isNull()) {
                failed(session, now, "not_found");
                return;
            }
            Map<String, Number> observed = new LinkedHashMap<>();
            int found = 0;
            for (String metric : METRICS) {
                JsonNode value = detail.path(TOKENS.contains(metric) ? "usage" : "stats").path(metric);
                Number number = value.isNumber() && Double.isFinite(value.asDouble()) && value.asDouble() >= 0 ? value.numberValue() : null;
                if (number != null) found++;
                observed.put(metric, number);
            }
            dao.updateUsage(session, detail.path("status").asText(null), observed,
                found == METRICS.size() ? "complete" : "partial", now);
        } catch (KitError failure) {
            failed(session, now, "failed");
        }
    }

    private void failed(String session, String now, String status) {
        dao.markCollectionFailure(status, now, session);
    }

    private Map<String, Object> aggregate(String member, String slug) {
        Row row = dao.aggregate(member, slug);
        Map<String, Object> metrics = new LinkedHashMap<>();
        for (String name : METRICS) {
            metrics.put(name, KitJson.fields("value", row.get(name), "covered_sessions", row.integer(name + "_covered")));
        }
        long total = row.integer("total");
        long failed = row.integer("failed");
        Map<String, Object> view = KitJson.fields("session_count", total, "deleted_session_count", row.integer("deleted"),
            "metrics", metrics, "completed_sessions", row.integer("completed"),
            "refresh_status", total > 0 && failed == total ? "failed" : row.integer("incomplete") > 0 ? "partial" : "idle");
        if (row.get("refreshed") != null) view.put("refreshed_at", row.get("refreshed"));
        return view;
    }

    public Object templateStats(String search) {
        String like = SessionService.like(search == null ? "" : search.trim().toLowerCase(Locale.ROOT));
        List<Row> templates = dao.listTemplates(like, like);
        List<Object> result = new ArrayList<>();
        for (Row template : templates) {
            String slug = template.text("slug");
            Map<String, Object> totals = aggregate(null, slug == null ? "" : slug);
            Map<String, Object> view = new LinkedHashMap<>(template);
            view.remove("slug");
            if (view.get("listing_status") == null) view.put("listing_status", "unlisted");
            for (String field : List.of("session_count", "deleted_session_count", "metrics", "refreshed_at"))
                if (totals.containsKey(field)) view.put(field, totals.get(field));
            result.add(view);
        }
        return KitJson.data(result);
    }

    public Object page(String target, String slug, RequestContext call, boolean template) {
        if (!template) sync(target);
        else {
            Row listing = dao.findTemplateListing(target);
            if (listing == null) throw KitError.missing("模版不存在");
            slug = listing.text("slug");
            if (slug == null) return KitJson.data(List.of());
        }
        String cursorAt = null;
        String cursorId = null;
        String token = call.query("cursor");
        if (token != null) {
            try {
                JsonNode cursor = json.stored(Crypto.decode(token));
                if (!target.equals(cursor.path(template ? "template_id" : "member_id").asText())
                    || !template && !java.util.Objects.equals(slug, cursor.path("agent_slug").asText(null))) throw KitError.invalidRequest();
                String at = cursor.path("created_at").asText();
                Instant.parse(at);
                String previous = cursor.path("session_id").asText();
                if (previous.isEmpty()) throw KitError.invalidRequest();
                cursorAt = at;
                cursorId = previous;
            } catch (RuntimeException error) {
                throw KitError.invalid("会话用量分页游标无效");
            }
        }
        int limit = call.query.path("limit").asInt(50);
        List<Row> rows = dao.listUsage(target, slug, template, cursorAt, cursorId, limit + 1);
        boolean more = rows.size() > limit;
        if (more) rows.remove(rows.size() - 1);
        Map<String, Object> response = KitJson.data(rows.stream().map(MemberUsageService::session).collect(Collectors.toList()));
        if (more) {
            Row last = rows.get(rows.size() - 1);
            Map<String, Object> cursor = KitJson.fields(template ? "template_id" : "member_id", target,
                "session_id", last.text("session_id"), "created_at", last.text("created_at"));
            if (!template) cursor.put("agent_slug", slug);
            response.put("next_cursor", Crypto.base64(json.write(cursor)));
        }
        return response;
    }

    private static Object session(Row row) {
        Map<String, Object> session = new LinkedHashMap<>();
        for (String key : List.of("session_id", "member_id", "agent_slug", "title", "status", "created_at", "deleted_at",
            "captured_at", "collection_status", "member_display_name", "member_username")) SessionService.put(session, row, key);
        Map<String, Object> usage = new LinkedHashMap<>();
        Map<String, Object> stats = new LinkedHashMap<>();
        TOKENS.forEach(key -> SessionService.put(usage, row, key));
        TIMES.forEach(key -> SessionService.put(stats, row, key));
        session.put("usage", usage);
        session.put("stats", stats);
        return session;
    }

    public Object daily(RequestContext call) {
        int days = call.query.path("days").asInt(30);
        String template = call.query("template_id");
        String slug = null;
        if (template != null) {
            Row row = dao.findListedSlug(template);
            slug = row == null ? "" : row.text("slug");
        }
        List<Object> data = ledger.trend(Aggregate.AGENT_DAY, slug, days);
        Row since = slug == null
            ? dao.firstUsageDay()
            : dao.firstUsageDayForAgent(slug);
        return KitJson.data(KitJson.fields("days", days, "from_day", UsageLimitService.today().minusDays(days - 1L).toString(),
            "to_day", UsageLimitService.today().toString(), "since_day", since.text("since_day"), "data", data));
    }

    public Object telemetry(RequestContext call, String method) {
        String session = call.query("session_id");
        Map<String, Object> request = new LinkedHashMap<>();
        if (session != null) request.put("scope", Map.of("type", "session", "session_id", session));
        else {
            String workspace = config.value("BAILIAN_WORKSPACE_ID", "");
            if (workspace.isEmpty() && gateway.health().path("mode").asText().equals("mock")) workspace = "ws-mock";
            if (workspace.isEmpty()) {
                throw new KitError("invalid_request", 400, "服务端未配置 BAILIAN_WORKSPACE_ID", false,
                    Map.of("workspace_unconfigured", true));
            }
            Map<String, Object> scope = KitJson.fields("type", "workspace", "workspace_ids", List.of(workspace));
            if (call.query.has("agent_id")) scope.put("agent_id", call.query("agent_id"));
            long end = call.query.path("end_time").asLong(System.currentTimeMillis());
            long start = call.query.path("start_time").asLong(end - TimeUnit.DAYS.toMillis(7));
            if (start > end) throw KitError.invalid("时间区间无效：start_time 不能晚于 end_time");
            request.put("scope", scope);
            request.put("time_range", Map.of("start_time", start, "end_time", end));
        }
        for (String key : List.of("model_name", "tool_name", "source", "sort_by", "page_no", "page_size", "sort_order")) {
            if (call.query.has(key)) request.put(key, call.query.get(key));
        }
        return KitJson.data(gateway.call(method, request));
    }

    @PreDestroy
    void close() {
        collectors.shutdownNow();
    }
}
