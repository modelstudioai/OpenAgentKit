package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.MemberDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.support.Crypto;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public final class MemberService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final MemberDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final MemberUsageService stats;
    private final Confirmations confirmations;
    private final Object groups = new Object();

    MemberService(MemberDao dao, KitTransactions transactions, KitJson json, MemberUsageService stats, Confirmations confirmations) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.stats = stats;
        this.confirmations = confirmations;
    }

    private Row member(String id) {
        Row row = dao.findMember(id);
        if (row == null) throw KitError.missing("成员不存在");
        return row;
    }

    public Map<String, Object> createMember(RequestContext call) {
        String username = call.value("username").trim().toLowerCase(Locale.ROOT);
        String displayName = call.value("display_name").trim();
        if (displayName.isEmpty()) throw KitError.invalidRequest();
        boolean automatic = "auto".equals(call.value("password_mode"));
        if (automatic && call.body.has("password")) throw KitError.invalid("自动生成模式不得传入密码");
        String password = automatic ? randomPassword(username) : call.value("password");
        if (password == null || !password.matches("(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])[!-~]{8,32}")
            || password.toLowerCase(Locale.ROOT).contains(username)) {
            throw KitError.invalid("密码须包含大小写字母、数字和特殊字符，且不能包含用户名");
        }
        String hash = Crypto.password(password);
        String now = KitJson.now();
        String id = "member_" + UUID.randomUUID();
        try {
            dao.insertMember(id, username, displayName, call.value("email"), hash, now, now);
        } catch (DuplicateKeyException error) {
            throw KitError.conflict("用户名已存在，请使用其他用户名");
        }
        Map<String, Object> result = KitJson.fields("member", AuthService.memberView(member(id)));
        if (automatic) result.put("initial_password", password);
        return result;
    }

    private static String randomPassword(String username) {
        List<String> classes = List.of("abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*_-+=?");
        String alphabet = String.join("", classes);
        for (;;) {
            List<Character> letters = new ArrayList<>();
            classes.forEach(group -> letters.add(group.charAt(RANDOM.nextInt(group.length()))));
            while (letters.size() < 20) letters.add(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
            Collections.shuffle(letters, RANDOM);
            StringBuilder result = new StringBuilder();
            letters.forEach(result::append);
            String password = result.toString();
            if (!password.toLowerCase(Locale.ROOT).contains(username)) return password;
        }
    }

    public Object memberPage(RequestContext call) {
        String search = search(call);
        return page(call, (at, id, limit) -> dao.searchMembers(search, at, id, limit),
            Map.of("search", search), row -> {
                String id = row.text("member_id");
                Map<String, Object> view = AuthService.memberView(row);
                view.put("groups", dao.listMemberships(id));
                view.put("usage_summary", stats.summary(id, null, false));
                return view;
            }, "member_id");
    }

    private Row group(String id) {
        Row group = dao.findGroup(id);
        if (group == null) throw KitError.missing("用户组不存在");
        omitEmpty(group, "description");
        return group;
    }

    public Object groupPage(RequestContext call, String memberId) {
        String search = search(call);
        String membership = call.query.path("membership").asText("all");
        if (memberId != null) member(memberId);
        String context = memberId == null ? json.write(List.of("groups", search))
            : json.write(List.of("member-groups", memberId, membership, search));
        return page(call, (at, id, limit) -> dao.searchGroups(memberId, membership, search, at, id, limit),
            Map.of("context", context), row -> {
                omitEmpty(row, "description");
                if (memberId != null) row.put("is_member", row.yes("is_member"));
                return row;
            }, "group_id");
    }

    public Object groupMembers(RequestContext call) {
        String id = call.id("groupId");
        group(id);
        String search = search(call);
        String membership = call.query.path("membership").asText("all");
        String context = json.write(List.of("group-members", id, membership, search));
        return page(call, (at, previous, limit) -> dao.searchGroupMembers(id, membership, search, at, previous, limit),
            Map.of("context", context), row -> {
                Map<String, Object> view = AuthService.memberView(row);
                view.put("is_member", row.yes("is_member"));
                view.put("usage_summary", stats.summary(row.text("member_id"), null, false));
                return view;
            }, "member_id");
    }

    @FunctionalInterface
    private interface MemberPage {
        List<Row> load(String cursorAt, String cursorId, int limit);
    }

    private Object page(RequestContext call, MemberPage load, Map<String, String> context, Function<Row, Object> project, String id) {
        int limit = call.query.path("limit").asInt(50);
        String cursorAt = null;
        String cursorId = null;
        boolean groups = context.containsKey("context");
        String field = groups ? "id" : id;
        String token = call.query("page_token");
        if (token != null) {
            try {
                JsonNode cursor = json.stored(Crypto.decode(token));
                for (Map.Entry<String, String> binding : context.entrySet()) {
                    if (!binding.getValue().equals(cursor.path(binding.getKey()).asText())) throw KitError.invalidRequest();
                }
                String date = cursor.path("created_at").asText();
                Instant.parse(date);
                String previous = cursor.path(field).asText();
                if (!previous.matches("(group|member)_[0-9a-f-]{36}")) throw KitError.invalidRequest();
                cursorAt = date;
                cursorId = previous;
            } catch (RuntimeException error) {
                throw KitError.invalid("分页游标无效或与当前查询不匹配，请重新查询");
            }
        }
        List<Row> rows = load.load(cursorAt, cursorId, limit + 1);
        boolean more = rows.size() > limit;
        if (more) rows.remove(rows.size() - 1);
        Map<String, Object> result = KitJson.data(rows.stream().map(project).collect(Collectors.toList()));
        if (more) {
            Row last = rows.get(rows.size() - 1);
            Map<String, Object> next = KitJson.fields("created_at", last.text("created_at"), field, last.text(id));
            next.putAll(context);
            result.put("next_page_token", Crypto.base64(json.write(next)));
        }
        return result;
    }

    public Object saveGroup(RequestContext call, boolean update) {
        String name = call.value("name").trim();
        String description = call.value("description");
        if (name.isEmpty()) throw KitError.invalidRequest();
        synchronized (groups) {
            try {
                return transactions.run(() -> {
                    String id = update ? call.id("groupId") : "group_" + UUID.randomUUID();
                    String now = KitJson.now();
                    if (!update) {
                        dao.insertGroup(id, name, description, now, now);
                        return KitJson.data(group(id));
                    }
                    Row current = group(id);
                    String nextDescription = description == null ? current.text("description") : description.trim();
                    if (!name.equals(current.text("name")) || !java.util.Objects.equals(nextDescription, current.text("description"))) {
                        dao.updateGroup(name, nextDescription, now, id);
                    }
                    return KitJson.data(group(id));
                });
            } catch (DuplicateKeyException error) {
                throw KitError.conflict("用户组名称已存在");
            }
        }
    }

    public Object changeMembers(RequestContext call, boolean fromGroup) {
        String id = call.id(fromGroup ? "groupId" : "memberId");
        String target = fromGroup ? "member_ids" : "group_ids";
        List<String> add = ids(call.body.path("add_" + target));
        List<String> remove = ids(call.body.path("remove_" + target));
        if (add.stream().anyMatch(remove::contains)) throw KitError.invalid("同一项不能同时添加和移除");
        synchronized (groups) {
            return transactions.run(() -> {
                if (fromGroup) group(id);
                else member(id);
                Set<String> changed = new LinkedHashSet<>();
                for (boolean adding : new boolean[] { true, false }) {
                    for (String item : adding ? add : remove) {
                        if (fromGroup) member(item);
                        else group(item);
                        String member = fromGroup ? item : id;
                        String group = fromGroup ? id : item;
                        if (adding) {
                            if (dao.findGroupMembership(group, member) != null)
                                continue;
                            dao.insertGroupMembership(group, member);
                            changed.add(group);
                        } else if (dao.deleteGroupMembership(group, member) > 0) {
                            changed.add(group);
                        }
                    }
                }
                for (String group : changed) dao.advanceGroupRevision(KitJson.now(), group);
                return KitJson.data(fromGroup ? group(id) : Map.of("updated", true));
            });
        }
    }

    public Object deletionPlan(RequestContext call) {
        String id = call.id("groupId");
        Row group = group(id);
        String plan = "group_delete:" + id + ":" + group.integer("revision") + ":" + UUID.randomUUID();
        return KitJson.data(confirmations.plan(plan, "groups.delete:" + id, call.subject(), List.of(KitJson.fields(
            "resource", "group:" + id, "action", "delete", "destructive", true, "summary",
            "删除用户组「" + group.text("name") + "」，移除 " + group.integer("member_count") + " 位成员的组关联")), true));
    }

    public Object removeGroup(RequestContext call) {
        String id = call.id("groupId");
        synchronized (groups) {
            confirmations.consume(call, "groups.delete:" + id, "group_delete:" + id + ":");
            return transactions.run(() -> {
                Row current = group(id);
                if (!call.value("plan_id").startsWith("group_delete:" + id + ":" + current.integer("revision") + ":"))
                    throw KitError.conflict("用户组已变化，请重新计划");
                dao.clearGroupMembers(id);
                dao.deleteGroup(id);
                return KitJson.data(Map.of("deleted", true));
            });
        }
    }

    static List<String> ids(JsonNode values) {
        Set<String> result = new LinkedHashSet<>();
        values.forEach(value -> result.add(value.asText()));
        return new ArrayList<>(result);
    }

    static void omitEmpty(Row row, String key) {
        if (row.get(key) == null || row.text(key).isEmpty()) row.remove(key);
    }

    private static String search(RequestContext call) {
        return call.query.path("search").asText("").trim().toLowerCase(Locale.ROOT);
    }

    public Object detail(String id) {
        return KitJson.fields("data", AuthService.memberView(member(id)), "usage_summary", stats.summary(id, null, false));
    }

    public Object usage(RequestContext call) {
        String id = call.id("memberId");
        member(id);
        return KitJson.data(stats.summary(id, call.query("agent_slug"), "true".equals(call.query("refresh"))));
    }

    public Object sessions(RequestContext call) {
        member(call.id("memberId"));
        return stats.page(call.id("memberId"), call.query("agent_slug"), call, false);
    }

    public Object groupDetail(String id) {
        return KitJson.data(group(id));
    }
}
