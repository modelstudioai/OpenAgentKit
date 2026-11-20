package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.CatalogDao;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public final class CatalogService {
    private static final List<String> TEXT = List.of("display_name", "description", "icon", "opening_remarks",
        "remote_agent_id", "remote_environment_id", "visibility", "category");
    private static final List<String> NUMBERS = List.of("remote_agent_version", "agent_version", "ordering");
    private static final Map<String, String> JSON = Map.of("suggested_prompts", "suggested_prompts", "capabilities", "capabilities",
        "theme", "theme", "files", "files_json", "memory_stores", "memory_stores_json", "vault_ids", "vault_ids_json");
    final Object mutations = new Object();
    private final CatalogDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final ResourceMetadata metadata;
    private final Confirmations confirmations;
    private final MetaService audit;

    CatalogService(CatalogDao dao, KitTransactions transactions, KitJson json, ResourceMetadata metadata, Confirmations confirmations, MetaService audit) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.metadata = metadata;
        this.confirmations = confirmations;
        this.audit = audit;
    }

    Row bySlug(String slug) {
        return dao.findBySlug(slug);
    }

    Row byId(String id) {
        return id == null ? null : dao.findById(id);
    }

    private Row require(String slug) {
        Row row = bySlug(slug);
        if (row == null) throw KitError.missing("agent 不存在");
        return row;
    }

    Row create(ObjectNode config, String status) {
        Map<String, Object> fields = values(config);
        String id = "cat_" + UUID.randomUUID().toString().substring(0, 8);
        String now = KitJson.now();
        fields.putIfAbsent("capabilities", json.write(Map.of("streaming", true, "fileUpload", true, "artifacts", true,
            "threads", true, "reasoning", true)));
        fields.put("id", id);
        fields.put("slug", config.path("slug").asText());
        fields.put("status", status);
        fields.put("created_at", now);
        fields.put("updated_at", now);
        if (status.equals("listed")) fields.put("listed_at", now);
        try {
            dao.insert(fields);
        } catch (DuplicateKeyException error) {
            throw KitError.conflict("目录条目已存在");
        }
        return byId(id);
    }

    Row updateRow(Row current, ObjectNode patch, String status) {
        Map<String, Object> fields = values(patch);
        String now = KitJson.now();
        fields.put("updated_at", now);
        if (status != null) {
            fields.put("status", status);
            if (status.equals("listed") && !status.equals(current.text("status"))) fields.put("listed_at", now);
        }
        if (dao.update(current.text("id"), fields) != 1)
            throw KitError.conflict("目录条目已变化，请刷新");
        return byId(current.text("id"));
    }

    private Map<String, Object> values(ObjectNode input) {
        Map<String, Object> fields = new LinkedHashMap<>();
        for (String key : TEXT) if (input.has(key)) fields.put(key, input.path(key).asText(null));
        for (String key : NUMBERS) if (input.has(key)) fields.put(key, input.path(key).numberValue());
        for (Map.Entry<String, String> field : JSON.entrySet()) {
            if (input.has(field.getKey())) {
                JsonNode value = input.get(field.getKey());
                fields.put(field.getValue(), value.isNull() ? null : json.write(value));
            }
        }
        if (input.has("featured")) fields.put("featured", input.path("featured").asBoolean() ? 1 : 0);
        return fields;
    }

    Map<String, Object> view(Row row) {
        Map<String, Object> output = new LinkedHashMap<>();
        for (String key : TEXT) SessionService.put(output, row, key);
        for (String key : NUMBERS) SessionService.put(output, row, key);
        for (String key : List.of("id", "slug", "status", "created_at", "updated_at", "listed_at"))
            SessionService.put(output, row, key);
        JSON.forEach((key, column) -> {
            if (row.get(column) != null) output.put(key, json.stored(row.get(column)));
        });
        output.put("remote_environment_id", row.get("remote_environment_id"));
        output.put("featured", row.yes("featured"));
        return output;
    }

    public Object update(RequestContext call) {
        String slug = call.id("slug");
        Row before = require(slug);
        ObjectNode requested = call.body.deepCopy();
        ObjectNode check = requested.deepCopy();
        if (!check.has("remote_agent_id")) check.put("remote_agent_id", before.text("remote_agent_id"));
        if (!check.has("agent_version")) {
            if (!check.path("remote_agent_id").asText().equals(before.text("remote_agent_id"))) {
                requested.putNull("agent_version");
                check.putNull("agent_version");
            } else if (before.get("agent_version") != null) check.put("agent_version", before.integer("agent_version"));
        }
        ObjectNode canonical = metadata.prepare(check);
        requested.fieldNames().forEachRemaining(key -> requested.set(key, canonical.get(key)));
        synchronized (mutations) {
            return transactions.run(() -> {
                Row latest = require(slug);
                if (!latest.equals(before)) throw KitError.conflict("目录条目已变化，请刷新后重试");
                Row saved = updateRow(latest, requested, null);
                audit.audit(call.subject(), "catalog.update", slug, null);
                return KitJson.data(view(saved));
            });
        }
    }

    public Object plan(RequestContext call) {
        Row entry = require(call.id("slug"));
        String slug = entry.text("slug");
        boolean delete = "delete".equals(call.value("action"));
        String target = delete ? "delete" : call.value("status");
        String id = confirmations.id("catalog", slug + "_" + target);
        String summary = delete ? "移除目录条目「" + entry.text("display_name") + "」，保留远端智能体和现有会话"
            : "将「" + entry.text("display_name") + "」设为" + (target.equals("listed") ? "已上架" : "未上架");
        return KitJson.data(confirmations.plan(id, delete ? "catalog.delete" : "catalog.listing", call.subject(),
            List.of(Map.of("resource", "catalog:" + slug, "action", delete ? "delete" : "update",
                "destructive", true, "summary", summary)), true));
    }

    public Object listing(RequestContext call) {
        String slug = call.id("slug");
        String status = call.value("status");
        synchronized (mutations) {
            confirmations.consume(call, "catalog.listing", "catalog_" + slug + "_" + status + "_");
            return transactions.run(() -> {
                Row entry = updateRow(require(slug), json.object(), status);
                audit.audit(call.subject(), status.equals("listed") ? "catalog.list" : "catalog.unlist", slug, null);
                return KitJson.data(view(entry));
            });
        }
    }

    public Object remove(RequestContext call) {
        String slug = call.id("slug");
        synchronized (mutations) {
            Row entry = require(slug);
            confirmations.consume(call, "catalog.delete", "catalog_" + slug + "_delete_");
            return transactions.run(() -> {
                boolean deleted = dao.delete(entry.text("id")) == 1;
                audit.audit(call.subject(), "catalog.delete", slug, null);
                return KitJson.data(Map.of("deleted", deleted));
            });
        }
    }

    public Object list() {
        return KitJson.data(dao.list()
            .stream().map(this::view).collect(Collectors.toList()));
    }

    public Object create(RequestContext call) {
        ObjectNode config = metadata.prepare(call.body.deepCopy());
        synchronized (mutations) {
            return transactions.run(() -> {
                Row entry = create(config, "unlisted");
                audit.audit(call.subject(), "catalog.create", entry.text("slug"), null);
                return KitJson.data(view(entry));
            });
        }
    }
}
