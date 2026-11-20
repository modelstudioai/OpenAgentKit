package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.UsageLimitDao.Aggregate;
import org.openagentkit.server.dao.UsageLimitDao.RuleScope;
import org.openagentkit.server.dao.UsageLimitDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

@Service
public final class UsageLimitService {
    private static final List<String> LIMITS = List.of("monthly_tokens", "monthly_active_seconds", "daily_tokens", "daily_active_seconds");
    private static final Set<String> ENDED = Set.of("idle", "completed", "failed", "stopped", "terminated", "archived");
    private final UsageLimitDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final GatewayClient gateway;
    private final SessionEvents events;
    private final Object[] locks = new Object[256];

    UsageLimitService(UsageLimitDao dao, KitTransactions transactions, KitJson json, GatewayClient gateway, SessionEvents events) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.gateway = gateway;
        this.events = events;
        Arrays.setAll(locks, index -> new Object());
    }

    private void require(String id, boolean template) {
        if (!dao.targetExists(id, template))
            throw KitError.missing(template ? "模版不存在" : "成员不存在");
    }

    public Map<String, Object> policy() {
        Row policy = dao.findPolicy();
        return KitJson.fields("limits", limits(policy), "updated_at", policy == null ? null : policy.get("updated_at"),
            "updated_by", policy == null ? null : policy.get("updated_by"));
    }

    private void saveLimits(RuleScope scope, Object id, JsonNode body, String by) {
        Number monthlyTokens = body.path("monthly_tokens").numberValue();
        Number monthlySeconds = body.path("monthly_active_seconds").numberValue();
        Number dailyTokens = body.path("daily_tokens").numberValue();
        Number dailySeconds = body.path("daily_active_seconds").numberValue();
        if (monthlyTokens != null && dailyTokens != null && dailyTokens.longValue() > monthlyTokens.longValue())
            throw KitError.invalid("日 Token 上限不能高于月度 Token 上限");
        if (monthlySeconds != null && dailySeconds != null && dailySeconds.doubleValue() > monthlySeconds.doubleValue())
            throw KitError.invalid("日执行时长上限不能高于月度执行时长上限");
        dao.saveRule(scope, id, monthlyTokens, monthlySeconds, dailyTokens, dailySeconds, KitJson.now(), by);
    }

    private Map<String, Object> limits(Row config) {
        Map<String, Object> result = new LinkedHashMap<>();
        LIMITS.forEach(key -> result.put(key, config == null ? null : config.get(key)));
        return result;
    }

    private static boolean limited(Row row) {
        return row != null && LIMITS.stream().anyMatch(name -> row.get(name) != null);
    }

    <T> T serial(String subject, Supplier<T> work) {
        synchronized (locks[Math.floorMod(subject.hashCode(), locks.length)]) {
            return work.get();
        }
    }

    void admit(AuthService.Principal principal, Row session) {
        String month = month();
        if (principal.member == null) {
            Map<String, Object> credits = creditState(principal.subject, month, false);
            if (!Boolean.TRUE.equals(credits.get("unlimited")) && ((Number) credits.get("remaining")).longValue() < 1) {
                throw new KitError("quota_exceeded", 403, "本月 Credits 已用完，可申请提额或等下月重置", false,
                    KitJson.fields("month", month, "limit", credits.get("limit"), "used", credits.get("used"),
                        "remaining", credits.get("remaining"), "reset_at", credits.get("reset_at")));
            }
            return;
        }
        admitMember(principal.subject, session, month, false);
    }

    void admitApproval(AuthService.Principal principal, Row session) {
        if (principal.member == null) return;
        Row accounting = dao.findAdmissionMonth(session.text("session_id"));
        String admission = accounting == null ? null : accounting.text("admission_month");
        serial(principal.subject, () -> {
            admitMember(principal.subject, session, admission == null ? month() : admission, true);
            return null;
        });
    }

    private void admitMember(String subject, Row session, String month, boolean continuation) {
        Row config = config(subject);
        Row template = dao.findTemplateRuleForAgent(session.text("agent_slug"));
        boolean required = limited(config) || limited(template);
        String sessionId = session.text("session_id");
        Availability reliable = collect(subject, month, sessionId, required);
        for (Row request : dao.listOpenRequests(subject)) {
            String id = request.text("session_id");
            if (request.text("status").equals("accepted") && !required) continue;
            if (continuation && request.text("status").equals("accepted") && id.equals(session.text("session_id"))) continue;
            if (!completed(request)) throw uncertain("上一轮仍在执行或结果待核对");
            dao.settleRequest(id, request.text("request_key"));
        }
        if (required && !continuation && !ended(session.text("session_id"))) throw uncertain("会话仍在执行，请等待或中断后重试");
        check(config, dao.findMemberMonth(subject, month),
            dao.findMemberDay(subject, today().toString()),
            month, reliable, false);
        if (limited(template)) checkTemplate(template, session.text("agent_slug"), subject, month, reliable);
    }

    private boolean completed(Row request) {
        String id = request.text("session_id");
        Row deleted = dao.findDeletedUsage(id);
        if (deleted != null && deleted.get("deleted_at") != null) return true;
        if (!request.text("status").equals("accepted") || !ended(id)) return false;
        JsonNode ids = json.stored(request.text("event_ids"));
        Set<String> sent = new java.util.HashSet<>();
        ids.forEach(it -> sent.add(it.asText()));
        if (sent.isEmpty()) return false;
        boolean sentSeen = false;
        for (JsonNode event : events.history(id)) {
            if (sent.contains(event.path("event_id").asText())) sentSeen = true;
            if (sentSeen && ENDED.contains(java.util.Objects.toString(SessionEvents.status(event), ""))) return true;
        }
        return false;
    }

    private boolean ended(String session) {
        JsonNode detail = gateway.call("getSession", session);
        if (!ENDED.contains(detail.path("status").asText()) ||
            "requires_action".equals(detail.path("stop_reason").path("type").asText())) return false;
        String historical = SessionEvents.latestStatus(events.history(session));
        return historical == null || ENDED.contains(historical);
    }

    private void check(Row config, Row monthTotals, Row dayTotals, String month, Availability available, boolean template) {
        if (config == null) return;
        checkMetric(config, "monthly_tokens", "tokens", monthTotals, month, false, available.tokens, template);
        checkMetric(config, "monthly_active_seconds", "active_seconds", monthTotals, month, false, available.seconds, template);
        checkMetric(config, "daily_tokens", "tokens", dayTotals, today().toString(), true,
            available.tokens && (monthTotals == null || !monthTotals.yes("tokens_unknown")), template);
        checkMetric(config, "daily_active_seconds", "active_seconds", dayTotals, today().toString(), true,
            available.seconds && (monthTotals == null || !monthTotals.yes("active_seconds_unknown")), template);
    }

    private void checkMetric(Row config, String column, String metric, Row totals, String period,
                             boolean daily, boolean available, boolean template) {
        if (config.get(column) == null) return;
        if (!available || totals != null && totals.yes(metric + "_unknown")) {
            Map<String, Object> details = KitJson.fields("metric", metric, "usage_unavailable", true);
            if (template) details.put("scope", "template");
            throw new KitError("conflict", 409, "当前用量暂不可确认，请稍后重试", true, details);
        }
        double limit = config.decimal(column);
        double used = totals == null ? 0 : totals.decimal(metric);
        if (used >= limit) {
            Map<String, Object> details = KitJson.fields("metric", metric, "limit", limit, "used", used, "remaining", limit - used,
                "reset_at", daily ? resetDay() : resetMonth(period), "period", daily ? "day" : "month");
            details.put(daily ? "day" : "month", period);
            if (template) details.put("scope", "template");
            throw new KitError("quota_exceeded", 403, daily ? "今日用量已达到上限" : "本月用量已达到上限", false, details);
        }
    }

    private void checkTemplate(Row config, String slug, String subject, String month, Availability current) {
        Row monthly = dao.findAgentMonth(slug, month);
        Row daily = dao.findAgentDay(slug, today().toString());
        if (monthly == null) monthly = new Row();
        if (daily == null) daily = new Row();
        Availability available = current;
        for (Row prior : dao.listPeerBaselines(subject, month, slug, slug)) {
            try {
                Observation observation = new Observation(prior, counters(prior));
                available = available.and(observation.available);
                for (Row totals : List.of(monthly, daily)) {
                    totals.put("tokens", Math.addExact(totals.integer("tokens"), observation.tokens));
                    totals.put("active_seconds", totals.decimal("active_seconds") + observation.seconds);
                }
            } catch (KitError error) {
                available = Availability.NONE;
            }
        }
        check(config, monthly, daily, month, available, true);
    }

    void startTurn(Row session, String request, String digest) {
        String id = session.text("session_id");
        String member = session.text("subject_id");
        dao.createBaseline(id, member);
        dao.assignAdmissionMonth(month(), id);
        dao.insertRequest(id, requestKey(request), member, digest, "sending", KitJson.now());
    }

    void acceptTurn(String session, String request, JsonNode ids) {
        dao.acceptRequest(json.write(ids), session, requestKey(request));
    }

    void rejectTurn(String session, String request, KitError error) {
        if (error.details instanceof JsonNode && ((JsonNode) error.details).path("request_rejected").asBoolean()) {
            dao.deleteRequest(session, requestKey(request));
        } else dao.markUncertain(session, requestKey(request));
    }

    static String requestKey(String request) { return "message:" + request; }

    void recordTurn(Row session, String request, String now) {
        String id = session.text("session_id");
        if (request != null && dao.findTurn(id, request) != null) return;
        dao.addTurn(session.text("subject_id"),
                    session.text("agent_slug"),
                    id,
                    request,
                    now.substring(0, 10),
                    now.substring(0, 7),
                    now);
    }

    private Row config(String member) {
        Row override = dao.findOverride(member);
        return override == null ? dao.findPolicy() : override;
    }

    private Availability collect(String subject, String month, String target, boolean allCurrent) {
        dao.createMemberAccounting(subject, KitJson.now());
        Availability available = Availability.ALL;
        for (Row session : dao.listTrackedSessions(subject)) {
            boolean selected = session.text("session_id").equals(target);
            if (!selected && !(allCurrent && month.equals(session.text("admission_month")))) continue;
            try {
                available = available.and(observe(session, counters(session)));
            } catch (KitError error) {
                available = Availability.NONE;
            }
        }
        return available;
    }

    private Number[] counters(Row row) {
        if (row.get("finalized_at") != null && row.get("deleted_at") != null) {
            return new Number[] { (Number) row.get("final_input"), (Number) row.get("final_output"), (Number) row.get("final_seconds") };
        }
        return counters(gateway.call("getSession", row.text("session_id")));
    }

    private static Number[] counters(JsonNode detail) {
        JsonNode usage = detail.path("usage");
        return new Number[] { nonnegative(usage.path("input_tokens"), true), nonnegative(usage.path("output_tokens"), true),
            nonnegative(detail.path("stats").path("active_seconds"), false) };
    }

    private static Number nonnegative(JsonNode number, boolean integer) {
        if (!number.isNumber() || !Double.isFinite(number.doubleValue()) || number.doubleValue() < 0) return null;
        if (integer && (number.decimalValue().stripTrailingZeros().scale() > 0 || number.doubleValue() > 9_007_199_254_740_991d)) return null;
        return number.numberValue();
    }

    void captureFinal(Row session, JsonNode detail) {
        observe(session, counters(detail));
    }

    private Availability observe(Row session, Number[] counters) {
        String id = session.text("session_id");
        String subject = session.text("subject_id");
        String slug = session.text("agent_slug");
        return transactions.run(() -> {
            Row prior = dao.findBaseline(id);
            String admission = prior == null ? null : prior.text("admission_month");
            Observation change = new Observation(prior, counters);
            if (admission != null && (change.tokens > 0 || change.seconds > 0)) {
                dao.increment(Aggregate.MEMBER_MONTH, subject, admission, change.tokens, change.seconds);
                dao.increment(Aggregate.AGENT_MONTH, slug, admission, change.tokens, change.seconds);
                dao.increment(Aggregate.MEMBER_DAY, subject, today().toString(), change.tokens, change.seconds);
                dao.increment(Aggregate.AGENT_DAY, slug, today().toString(), change.tokens, change.seconds);
            }
            dao.updateBaseline(id,
                    subject,
                    change.input,
                    change.output,
                    change.time,
                    admission,
                    change.available.tokens && change.available.seconds ? KitJson.now() : prior == null ? null : prior.get("captured_at"));
            return change.available;
        });
    }

    private static final class Availability {
        static final Availability ALL = new Availability(true, true);
        static final Availability NONE = new Availability(false, false);
        final boolean tokens;
        final boolean seconds;

        Availability(boolean tokens, boolean seconds) {
            this.tokens = tokens;
            this.seconds = seconds;
        }

        Availability and(Availability other) {
            return new Availability(tokens && other.tokens, seconds && other.seconds);
        }
    }

    private static final class Observation {
        final Availability available;
        final Number input;
        final Number output;
        final Number time;
        final long tokens;
        final double seconds;

        Observation(Row prior, Number[] next) {
            Number beforeInput = prior == null ? null : (Number) prior.get("input_tokens");
            Number beforeOutput = prior == null ? null : (Number) prior.get("output_tokens");
            Number beforeTime = prior == null ? null : (Number) prior.get("active_seconds");
            available = new Availability(advanced(beforeInput, next[0]) && advanced(beforeOutput, next[1]),
                advanced(beforeTime, next[2]));
            input = available.tokens ? next[0] : beforeInput;
            output = available.tokens ? next[1] : beforeOutput;
            time = available.seconds ? next[2] : beforeTime;
            tokens = available.tokens && beforeInput != null && beforeOutput != null
                ? input.longValue() - beforeInput.longValue() + output.longValue() - beforeOutput.longValue() : 0L;
            seconds = available.seconds && beforeTime != null ? time.doubleValue() - beforeTime.doubleValue() : 0;
        }

        private static boolean advanced(Number previous, Number next) {
            return next != null && (previous == null || next.doubleValue() >= previous.doubleValue());
        }
    }

    private static KitError uncertain(String text) {
        return new KitError("conflict", 409, text, true, null);
    }

    Map<String, Object> member(String id, int days) {
        require(id, false);
        return serial(id, () -> {
            Availability complete = collect(id, month(), null, true);
            Row overrides = dao.findOverride(id);
            Map<String, Object> view = usageView(config(id), overrides,
                dao.findMemberMonth(id, month()),
                dao.findMemberDay(id, today().toString()), complete);
            view.put("member_id", id);
            view.put("accounting_started_at", dao.findAccountingStart(id).text("accounting_started_at"));
            if (complete.tokens || complete.seconds) view.put("refreshed_at", KitJson.now());
            view.put("daily", trend(Aggregate.MEMBER_DAY, id, days));
            return view;
        });
    }

    Map<String, Object> template(String id) {
        Row listing = dao.findTemplateSlug(id);
        Row overrides = dao.findTemplateRule(id);
        String slug = listing == null ? null : listing.text("slug");
        Map<String, Object> view = usageView(overrides, overrides,
            slug == null ? null : dao.findAgentMonth(slug, month()),
            slug == null ? null : dao.findAgentDay(slug, today().toString()),
            slug == null ? Availability.NONE : Availability.ALL);
        view.put("template_id", id);
        if (slug != null) view.put("refreshed_at", KitJson.now());
        return view;
    }

    private Map<String, Object> usageView(Row config, Row override, Row monthly, Row daily, Availability complete) {
        return KitJson.fields("month", month(), "reset_at", resetMonth(month()), "limits", limits(config),
            "override", override == null ? null : limits(override),
            "tokens", metric(config, "monthly_tokens", monthly, "tokens", complete.tokens),
            "active_seconds", metric(config, "monthly_active_seconds", monthly, "active_seconds", complete.seconds),
            "day_state", Map.of("day", today().toString(), "reset_at", resetDay(),
                "tokens", metric(config, "daily_tokens", daily, "tokens", complete.tokens && (monthly == null || !monthly.yes("tokens_unknown"))),
                "active_seconds", metric(config, "daily_active_seconds", daily, "active_seconds",
                    complete.seconds && (monthly == null || !monthly.yes("active_seconds_unknown")))));
    }

    private Map<String, Object> metric(Row config, String key, Row usage, String metric, boolean complete) {
        Number limit = config == null ? null : (Number) config.get(key);
        if (!complete || usage != null && usage.yes(metric + "_unknown"))
            return KitJson.fields("limit", limit, "used", null, "remaining", null, "status", "unavailable");
        double used = usage == null ? 0 : usage.decimal(metric);
        return KitJson.fields("limit", limit, "used", used, "remaining", limit == null ? null : limit.doubleValue() - used,
            "status", limit != null && used >= limit.doubleValue() ? "exceeded" : "ok");
    }

    List<Object> trend(Aggregate scope, String id, int days) {
        LocalDate now = today();
        LocalDate start = now.minusDays(days - 1L);
        Map<String, Row> indexed = new LinkedHashMap<>();
        List<Row> rows = dao.dailyUsage(scope, start.toString(), id);
        rows.forEach(row -> indexed.put(row.text("day"), row));
        List<Object> result = new ArrayList<>();
        for (int offset = 0; offset < days; offset++) {
            String day = start.plusDays(offset).toString();
            Row row = indexed.getOrDefault(day, new Row());
            result.add(Map.of("day", day, "tokens", row.integer("tokens"), "active_seconds", row.decimal("active_seconds")));
        }
        return result;
    }

    Map<String, Object> creditState(String subject, String month, boolean member) {
        Row policy = dao.findCreditsPolicy();
        Row override = dao.findCreditsOverride(subject);
        long base = member ? -1 : policy == null ? 200 : policy.integer("monthly_credits");
        Long cap = member || override == null ? null : override.integer("monthly_credits");
        long limit = cap == null ? base : cap;
        List<Row> packs = member ? List.of() : dao.listCreditPacks(subject, month);
        long extra = packs.stream().mapToLong(pack -> pack.integer("credits")).sum();
        long used = dao.countUsedCredits(subject, month).integer("n");
        return KitJson.fields("month", month, "reset_at", resetMonth(month), "unlimited", limit == -1,
            "base_limit", base, "override_limit", cap, "packs", packs, "limit", limit, "used", used,
            "remaining", limit == -1 ? -1 : limit + extra - used);
    }

    static LocalDate today() { return LocalDate.now(ZoneOffset.UTC); }
    static String month() { return YearMonth.now(ZoneOffset.UTC).toString(); }
    static String resetMonth(String month) { return KitJson.iso(YearMonth.parse(month).plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC)); }
    static String resetDay() { return KitJson.iso(today().plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)); }

    public Object own(RequestContext call) {
        return KitJson.data(call.identity.member == null ? null : member(call.subject(), call.query.path("days").asInt(30)));
    }

    public Object updatePolicy(RequestContext call) {
        saveLimits(RuleScope.POLICY, 1, call.body, call.subject());
        return KitJson.data(policy());
    }

    public Object limits(String id, boolean template) {
        return KitJson.data(template ? template(id) : member(id, 30));
    }

    public Object updateLimits(String id, boolean template, RequestContext call) {
        require(id, template);
        saveLimits(template ? RuleScope.TEMPLATE : RuleScope.MEMBER, id, call.body, call.subject());
        return limits(id, template);
    }

    public Object resetLimits(String id, boolean template) {
        require(id, template);
        dao.deleteRule(template ? RuleScope.TEMPLATE : RuleScope.MEMBER, id);
        return limits(id, template);
    }
}
