package org.openagentkit.server.service;

import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.QuotaDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public final class QuotaService {
    private final QuotaDao dao;
    private final KitTransactions transactions;
    private final UsageLimitService ledger;
    private final SessionService sessions;
    private final Object reviews = new Object();

    QuotaService(QuotaDao dao, KitTransactions transactions, UsageLimitService ledger, SessionService sessions) {
        this.dao = dao;
        this.transactions = transactions;
        this.ledger = ledger;
        this.sessions = sessions;
    }

    public Object plaza(RequestContext call) {
        List<Row> listed = sessions.listed();
        Map<String, Row> mine = new LinkedHashMap<>();
        dao.recentAgents(call.subject())
            .forEach(row -> mine.put(row.text("agent_slug"), row));
        Map<String, Long> turns = new LinkedHashMap<>();
        dao.recentTurnsByAgent(UsageLimitService.today().minusDays(29).toString()).forEach(row -> turns.put(row.text("agent_slug"), row.integer("turns")));
        String category = call.query("category");
        String search = call.query.path("q").asText("").trim().toLowerCase(Locale.ROOT);
        List<Object> visible = new ArrayList<>();
        List<String> featured = new ArrayList<>();
        for (Row agent : listed) {
            String slug = agent.text("slug");
            if (agent.yes("featured")) featured.add(slug);
            if (category != null && !category.equals(agent.text("category"))) continue;
            String searchable = (slug + " " + agent.text("display_name") + " " + java.util.Objects.toString(agent.text("description"), ""))
                .toLowerCase(Locale.ROOT);
            if (!searchable.contains(search)) continue;
            Map<String, Object> view = sessions.agentSummary(agent);
            Map<String, Object> stats = KitJson.fields("mine", mine.containsKey(slug), "turns_30d", turns.getOrDefault(slug, 0L));
            if (mine.containsKey(slug)) stats.put("last_used_at", mine.get(slug).text("at"));
            view.put("stats", stats);
            visible.add(view);
        }
        List<String> popular = listed.stream().filter(row -> turns.getOrDefault(row.text("slug"), 0L) > 0)
            .sorted(Comparator.comparingLong((Row row) -> turns.get(row.text("slug"))).reversed())
            .limit(5).map(row -> row.text("slug")).collect(Collectors.toList());
        if (popular.isEmpty()) popular = listed.stream().limit(5).map(row -> row.text("slug")).collect(Collectors.toList());
        List<Object> categories = new ArrayList<>();
        KitJson.fields("general", "通用", "writing", "写作", "coding", "编程", "data", "数据分析", "other", "其他")
            .forEach((id, name) -> categories.add(Map.of("id", id, "name", name,
                "count", listed.stream().filter(row -> id.equals(row.text("category"))).count())));
        return KitJson.data(Map.of("agents", visible, "featured", featured, "popular", popular, "categories", categories));
    }

    public Object quotaView(RequestContext call) {
        String subject = call.subject();
        String month = UsageLimitService.month();
        boolean member = call.identity.member != null;
        Map<String, Object> view = ledger.creditState(subject, month, member);
        view.put("per_agent", dao.monthlyTurnsByAgent(subject, month));
        int days = call.query.path("days").asInt(30);
        LocalDate start = UsageLimitService.today().minusDays(days - 1L);
        Map<String, Long> used = new LinkedHashMap<>();
        dao.dailyTurns(subject, start.toString())
            .forEach(row -> used.put(row.text("day"), row.integer("turns")));
        List<Object> daily = new ArrayList<>();
        for (int offset = 0; offset < days; offset++) {
            String day = start.plusDays(offset).toString();
            daily.add(Map.of("day", day, "turns", used.getOrDefault(day, 0L)));
        }
        view.put("daily", daily);
        List<Row> pending = member ? List.of() : requests(null, subject, "pending");
        view.put("pending_request", pending.isEmpty() ? null : pending.get(0));
        return KitJson.data(view);
    }

    public Object createRequest(RequestContext call) {
        return ledger.serial(call.subject(), () -> transactions.run(() -> {
            if (dao.findPendingRequest(call.subject()) != null)
                throw new KitError("request_pending", 409, "已有待审批的提额申请");
            String id = "qr_" + UUID.randomUUID().toString().substring(0, 8);
            dao.createRequest(id, call.subject(), call.body.path("requested_credits").asLong(), call.value("reason"), KitJson.now());
            return KitJson.data(requests(id, null, null).get(0));
        }));
    }

    private List<Row> requests(String id, String subject, String status) {
        List<Row> list = dao.listRequests(id, subject, status);
        list.forEach(row -> List.of("reason", "review_note", "reviewed_by", "reviewed_at").forEach(key -> MemberService.omitEmpty(row, key)));
        return list;
    }

    public Row policy() {
        Row row = dao.findPolicy();
        MemberService.omitEmpty(row, "updated_at");
        MemberService.omitEmpty(row, "updated_by");
        return row;
    }

    private Map<String, Object> overrideView(Row row) {
        MemberService.omitEmpty(row, "reason");
        Map<String, Object> state = ledger.creditState(row.text("subject_id"), UsageLimitService.month(), false);
        for (String key : List.of("used", "packs", "remaining")) row.put(key, state.get(key));
        return row;
    }

    private void setOverride(String subject, long limit, String note, String by) {
        dao.saveOverride(subject, limit, note, by, KitJson.now());
    }

    private Map<String, Object> addPack(String subject, long credits, String reason, String by) {
        String id = "qp_" + UUID.randomUUID().toString().substring(0, 8);
        String now = KitJson.now();
        String month = UsageLimitService.month();
        dao.insertPack(id, subject, month, credits, reason, by, now);
        Map<String, Object> result = KitJson.fields("id", id, "month", month, "credits", credits, "granted_by", by, "created_at", now);
        if (reason != null && !reason.isBlank()) result.put("reason", reason);
        return result;
    }

    public Object review(RequestContext call) {
        String id = call.id("id");
        boolean approve = "approve".equals(call.value("action"));
        String mode = call.value("mode");
        String note = call.value("note");
        if (approve && mode == null) throw KitError.invalid("通过申请必须指定提额生效方式");
        if (!approve && (note == null || note.isBlank())) throw KitError.invalid("驳回必须填写理由");
        synchronized (reviews) {
            return transactions.run(() -> {
                Row row = dao.findRequest(id);
                if (row == null) throw KitError.missing("提额申请不存在");
                if (!"pending".equals(row.text("status"))) throw KitError.conflict("该申请已审批");
                long granted = call.body.path("granted_credits").asLong(row.integer("requested_credits"));
                dao.reviewRequest(approve ? "approved" : "rejected",
                    approve ? mode : null,
                    approve ? granted : null,
                    note,
                    call.subject(),
                    KitJson.now(),
                    id);
                if (approve && "override".equals(mode)) setOverride(row.text("subject_id"), granted, "批准申请 " + id, call.subject());
                if (approve && "pack".equals(mode)) addPack(row.text("subject_id"), granted, "批准申请 " + id, call.subject());
                return KitJson.data(requests(id, null, null).get(0));
            });
        }
    }

    public Object usage(RequestContext call) {
        String month = call.query.path("month").asText(UsageLimitService.month());
        try { YearMonth.parse(month); } catch (RuntimeException error) { throw KitError.invalidRequest(); }
        List<Object> result = new ArrayList<>();
        for (Row row : dao.monthlyTurnsBySubject(month)) {
            String subject = row.text("subject_id");
            Map<String, Object> state = ledger.creditState(subject, month, false);
            result.add(KitJson.fields("subject_id", subject, "used", row.integer("used"), "limit", state.get("limit"),
                "remaining", state.get("remaining")));
        }
        return KitJson.data(result);
    }

    public Object requestsForMember(String subject) {
        return KitJson.data(requests(null, subject, null));
    }

    public Object requestsForAdmin(String status) {
        return KitJson.data(requests(null, null, status));
    }

    public Object updatePolicy(RequestContext call) {
        dao.updatePolicy(call.body.path("monthly_credits").asLong(), KitJson.now(), call.subject());
        return KitJson.data(policy());
    }

    public Object overrides() {
        return KitJson.data(dao.listOverrides()
            .stream().map(this::overrideView).collect(Collectors.toList()));
    }

    public Object updateOverride(RequestContext call) {
        String subject = call.id("subjectId");
        setOverride(subject, call.body.path("monthly_credits").asLong(), call.value("reason"), call.subject());
        return KitJson.data(overrideView(dao.findOverride(subject)));
    }

    public Object deleteOverride(String subject) {
        return KitJson.data(Map.of("deleted", dao.deleteOverride(subject) > 0));
    }

    public Object createPack(RequestContext call) {
        return KitJson.data(addPack(call.value("subject_id"), call.body.path("credits").asLong(), call.value("reason"), call.subject()));
    }

    public Object deletePack(String id) {
        return KitJson.data(Map.of("deleted", dao.deletePack(id) > 0));
    }
}
