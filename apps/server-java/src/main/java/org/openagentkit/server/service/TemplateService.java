package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.TemplateDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.support.Crypto;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public final class TemplateService {
    private final TemplateDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final ResourceMetadata metadata;
    private final CatalogService catalog;
    private final Confirmations confirmations;
    private final MetaService audit;

    TemplateService(TemplateDao dao, KitTransactions transactions, KitJson json, ResourceMetadata metadata, CatalogService catalog,
                   Confirmations confirmations, MetaService audit) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.metadata = metadata;
        this.catalog = catalog;
        this.confirmations = confirmations;
        this.audit = audit;
    }

    private Row require(String id) {
        Row row = dao.findTemplate(id);
        if (row == null) throw KitError.missing("模版不存在");
        return row;
    }

    private ObjectNode view(Row row) {
        ObjectNode view = json.stored(row.get("config_json")).deepCopy();
        view.put("template_id", row.text("template_id"));
        view.put("name", row.text("name"));
        view.put("created_at", row.text("created_at"));
        view.put("updated_at", row.text("updated_at"));
        view.put("version", row.integer("version"));
        if (row.text("catalog_id") != null) {
            ObjectNode listing = view.putObject("listing").put("catalog_id", row.text("catalog_id"))
                .put("slug", row.text("catalog_slug")).put("display_name", row.text("catalog_display_name"))
                .put("status", row.text("catalog_status"));
            if (row.get("catalog_listed_at") != null) listing.put("listed_at", row.text("catalog_listed_at"));
        }
        return view;
    }

    public Object save(RequestContext call, boolean update) {
        String id = update ? call.id("templateId") : "template_" + UUID.randomUUID();
        long base = call.body.path("base_version").asLong(0);
        if (update && require(id).integer("version") != base) throw stale();
        ObjectNode value = call.body.deepCopy();
        value.remove("base_version");
        String name = value.path("name").asText().trim();
        if (name.isEmpty()) throw KitError.invalidRequest();
        value.put("name", name);
        String agentId = value.path("remote_agent_id").asText();
        JsonNode agent = metadata.agent(agentId);
        String envId = value.path("remote_environment_id").asText(null);
        JsonNode environment = metadata.environment(envId);
        ObjectNode prepared = metadata.prepare(value);
        prepared.put("remote_agent_name", agent.path("name").asText(agentId));
        if (!environment.isNull()) prepared.put("remote_environment_name", environment.path("name").asText(envId));
        JsonNode version = value.hasNonNull("agent_version") ? value.get("agent_version") : agent.path("version");
        if (version.isNumber() && version.asLong() > 0) prepared.set("remote_agent_version", version);
        for (String key : List.of("description", "opening_remarks")) {
            String text = prepared.path(key).asText("").trim();
            if (text.isEmpty()) prepared.remove(key);
            else prepared.put(key, text);
        }
        ArrayNode prompts = json.mapper.createArrayNode();
        prepared.path("suggested_prompts").forEach(prompt -> {
            if (!prompt.asText().isBlank()) prompts.add(prompt.asText().trim());
        });
        prepared.set("suggested_prompts", prompts);
        for (String key : List.of("files", "memory_stores", "vault_ids")) if (!prepared.has(key)) prepared.putArray(key);

        synchronized (catalog.mutations) {
            try {
                return transactions.run(() -> persist(id, base, prepared, call.subject()));
            } catch (DuplicateKeyException error) {
                throw KitError.conflict("模版名称已存在，请使用其他名称");
            }
        }
    }

    private Object persist(String id, long base, ObjectNode prepared, String subject) {
        String name = prepared.path("name").asText();
        String agent = prepared.path("remote_agent_id").asText();
        String agentName = prepared.path("remote_agent_name").asText();
        String config = json.write(prepared);
        String now = KitJson.now();
        long next = base + 1;
        if (base == 0) {
            dao.insertTemplate(id, name, agent, agentName, config, now, now);
        } else {
            Row current = require(id);
            if (current.integer("version") != base) throw stale();
            int changed = dao.updateTemplate(name, agent, agentName, config, now, next, id, base);
            if (changed != 1) throw stale();
            if (current.get("catalog_id") != null) {
                Row entry = catalog.byId(current.text("catalog_id"));
                if (entry == null) throw KitError.conflict("关联的上架条目已变化");
                catalog.updateRow(entry, fromTemplate(prepared, entry.text("slug"), name.substring(0, Math.min(60, name.length())).stripTrailing()), null);
            }
        }
        dao.insertVersion(id, next, config, now);
        audit.audit(subject, base == 0 ? "templates.create" : "templates.update", id, Map.of("version", next));
        Object result = KitJson.data(view(require(id)));
        return result;
    }

    private static KitError stale() { return KitError.conflict("模版已有新版本，请刷新后重新编辑"); }

    public Object list(RequestContext call) {
        String search = call.query.path("search").asText("").trim().toLowerCase(Locale.ROOT);
        String status = call.query("status");
        String category = call.query("category");
        int limit = call.query.path("limit").asInt(50);
        String cursorAt = null;
        String cursorId = null;
        String token = call.query("page_token");
        if (token != null) {
            try {
                JsonNode cursor = json.stored(Crypto.decode(token));
                cursorAt = cursor.path("created_at").asText();
                Instant.parse(cursorAt);
                cursorId = cursor.path("id").asText();
                if (!search.equals(cursor.path("search").asText()) || !cursorId.matches("template_[0-9a-f-]{36}")
                    || !java.util.Objects.equals(status, cursor.path("status").asText(null))
                    || !java.util.Objects.equals(category, cursor.path("category").asText(null))) throw KitError.invalidRequest();
            } catch (RuntimeException error) {
                throw KitError.invalid("分页游标无效或与当前查询不匹配");
            }
        }
        List<Row> rows = dao.list(search, status, category, cursorAt, cursorId, limit + 1);
        boolean more = rows.size() > limit;
        if (more) rows.remove(rows.size() - 1);
        Map<String, Object> output = KitJson.data(rows.stream().map(this::view).collect(Collectors.toList()));
        if (more) {
            Row last = rows.get(rows.size() - 1);
            Map<String, Object> cursor = KitJson.fields("created_at", last.text("created_at"), "id", last.text("template_id"), "search", search);
            if (status != null) cursor.put("status", status);
            if (category != null) cursor.put("category", category);
            output.put("next_page_token", Crypto.base64(json.write(cursor)));
        }
        return output;
    }

    public Object versions(RequestContext call) {
        String id = call.id("templateId");
        long current = require(id).integer("version");
        String token = call.query("page_token");
        long before = current + 1;
        if (token != null) {
            try {
                JsonNode cursor = json.stored(Crypto.decode(token));
                before = cursor.path("before").asLong(0);
                if (!id.equals(cursor.path("template_id").asText()) || before < 1) throw KitError.invalidRequest();
            } catch (RuntimeException error) {
                throw KitError.invalid("版本分页游标无效或不属于当前模版");
            }
        }
        int limit = call.query.path("limit").asInt(30);
        List<Row> rows = dao.listVersions(id, before, limit + 1);
        boolean more = rows.size() > limit;
        if (more) rows.remove(rows.size() - 1);
        Map<String, Object> result = KitJson.fields("data", rows.stream().map(row -> historical(row, true)).collect(Collectors.toList()),
            "current_version", current);
        if (more) result.put("next_page_token", Crypto.base64(json.write(Map.of("template_id", id, "before",
            rows.get(rows.size() - 1).integer("version")))));
        return result;
    }

    public Object oneVersion(RequestContext call) {
        String id = call.id("templateId");
        long version;
        try { version = new BigDecimal(call.id("version")).longValueExact(); }
        catch (RuntimeException error) { throw KitError.invalidRequest(); }
        require(id);
        Row row = dao.findVersion(id, version);
        if (row == null) throw KitError.missing("模版版本不存在");
        return KitJson.data(historical(row, false));
    }

    private ObjectNode historical(Row row, boolean summary) {
        ObjectNode result = json.stored(row.get("config_json")).deepCopy();
        result.put("version", row.integer("version"));
        result.put("created_at", row.text("created_at"));
        if (summary) result.remove(List.of("description", "opening_remarks", "suggested_prompts"));
        else result.put("template_id", row.text("template_id"));
        return result;
    }

    public Object listingPlan(RequestContext call) {
        String id = call.id("templateId");
        String name = displayName(call);
        Row template = require(id);
        ObjectNode config = listingConfig(template, name);
        String slug = config.path("slug").asText();
        String plan = "template_listing:" + fingerprint(template, config) + ":" + UUID.randomUUID();
        boolean existing = template.get("catalog_id") != null;
        return KitJson.data(confirmations.plan(plan, "templates.listing:" + id, call.subject(), List.of(
            diff("catalog:" + slug, existing ? "update" : "create", existing,
                "使用模版配置同步智能体、环境、资源引用和展示信息"),
            diff("catalog:" + slug + "/status", "update", true, "「" + name + "」上架后员工端可见并可创建会话")), true));
    }

    public Object applyListing(RequestContext call) {
        String id = call.id("templateId");
        String name = displayName(call);
        confirmations.consume(call, "templates.listing:" + id, "template_listing:");
        Row template = require(id);
        ObjectNode prepared = listingConfig(template, name);
        synchronized (catalog.mutations) {
            return transactions.run(() -> {
                Row latest = require(id);
                if (!call.value("plan_id").startsWith("template_listing:" + fingerprint(latest, prepared) + ":"))
                    throw KitError.conflict("模版、上架信息或资源已变化，请重新预览");
                assertListingTarget(latest, prepared.path("slug").asText(), name);
                Row entry = catalog.byId(latest.text("catalog_id"));
                Row result = entry == null ? catalog.create(prepared, "listed") : catalog.updateRow(entry, prepared, "listed");
                dao.saveListing(id, result.text("id"));
                audit.audit(call.subject(), "templates.listing", id, Map.of("catalog_id", result.text("id")));
                return KitJson.data(catalog.view(result));
            });
        }
    }

    private ObjectNode listingConfig(Row template, String name) {
        String slug = template.text("catalog_slug") == null ? template.text("template_id") : template.text("catalog_slug");
        assertListingTarget(template, slug, name);
        ObjectNode source = json.stored(template.get("config_json")).deepCopy();
        metadata.agent(source.path("remote_agent_id").asText());
        metadata.environment(source.path("remote_environment_id").asText(null));
        return metadata.prepare(fromTemplate(source, slug, name));
    }

    private void assertListingTarget(Row template, String slug, String name) {
        if ("listed".equals(template.text("catalog_status"))) throw KitError.conflict("该模版已上架");
        Row entry = catalog.bySlug(slug);
        String id = template.text("catalog_id");
        if (entry != null && !entry.text("id").equals(id)) throw KitError.conflict("模版上架 ID 已被占用");
        if (dao.findConflictingListing(name, id == null ? "" : id) != null)
            throw KitError.conflict("展示名已存在，请使用其他展示名");
    }

    private ObjectNode fromTemplate(ObjectNode source, String slug, String displayName) {
        ObjectNode config = json.object().put("slug", slug).put("display_name", displayName);
        for (String key : List.of("remote_agent_id", "category", "remote_environment_id", "agent_version", "files", "memory_stores",
            "vault_ids", "description", "opening_remarks", "suggested_prompts")) {
            if (source.has(key)) config.set(key, source.get(key));
            else if (List.of("remote_environment_id", "agent_version").contains(key)) config.putNull(key);
        }
        return config;
    }

    private String fingerprint(Row template, ObjectNode listing) {
        Row entry = catalog.byId(template.text("catalog_id"));
        return Crypto.digest(json.write(KitJson.fields("template", template, "entry", entry, "listing", listing)));
    }

    public Object deletionPlan(RequestContext call) {
        String id = call.id("templateId");
        Row template = require(id);
        List<Object> diff = new ArrayList<>();
        diff.add(diff("template:" + id, "delete", true, "删除当前配置和所有历史版本"));
        if (template.get("catalog_id") != null) diff.add(diff("catalog:" + template.text("catalog_slug"), "delete", true, "移除关联目录条目"));
        diff.add(diff("template:" + id + "/retained-resources", "noop", false, "保留当前远端资源及已有会话"));
        return KitJson.data(confirmations.plan("template_delete:" + fingerprint(template, null) + ":" + UUID.randomUUID(),
            "templates.delete:" + id, call.subject(), diff, true));
    }

    public Object delete(RequestContext call) {
        String id = call.id("templateId");
        synchronized (catalog.mutations) {
            confirmations.consume(call, "templates.delete:" + id, "template_delete:");
            return transactions.run(() -> {
                Row template = require(id);
                if (!call.value("plan_id").startsWith("template_delete:" + fingerprint(template, null) + ":"))
                    throw KitError.conflict("模版或关联条目已变化，请重新计划");
                dao.deleteVersions(id);
                dao.deleteListing(id);
                dao.deleteTemplate(id);
                if (template.get("catalog_id") != null) dao.deleteCatalog(template.text("catalog_id"));
                audit.audit(call.subject(), "templates.delete", id, null);
                return KitJson.data(Map.of("deleted", true));
            });
        }
    }

    private static String displayName(RequestContext call) {
        String name = call.value("display_name").trim();
        if (name.isEmpty()) throw KitError.invalidRequest();
        return name;
    }

    private static Map<String, Object> diff(String resource, String action, boolean destructive, String summary) {
        return Map.of("resource", resource, "action", action, "destructive", destructive, "summary", summary);
    }

    public Object detail(String id) {
        return KitJson.data(view(require(id)));
    }
}
