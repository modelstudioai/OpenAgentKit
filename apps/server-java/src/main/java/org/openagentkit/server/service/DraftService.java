package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.DraftDao;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.support.Crypto;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;

@Service
public final class DraftService {
    private final DraftDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final GatewayClient gateway;
    private final Path uploads;
    private final Object[] locks = new Object[128];
    private final Object creating = new Object();

    DraftService(DraftDao dao, KitTransactions transactions, KitJson json, GatewayClient gateway, KitConfig config) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.gateway = gateway;
        this.uploads = config.dataDir().resolve("resource-draft-uploads");
        java.util.Arrays.setAll(locks, index -> new Object());
    }

    <T> T lock(String id, Supplier<T> work) {
        checkId(id);
        synchronized (locks[Math.floorMod(id.hashCode(), locks.length)]) {
            return work.get();
        }
    }

    Row get(String id) {
        checkId(id);
        return dao.findDraft(id);
    }

    Row owned(String id, String subject) {
        Row draft = get(id);
        if (draft == null || !subject.equals(draft.text("owner"))) throw KitError.missing("资源发布批次不存在");
        return draft;
    }

    Row active(String subject, String key) {
        Row row = dao.findActive(subject);
        if (row != null) checkCleanupKey(row, key);
        return row;
    }

    Row create(String subject, String key) {
        synchronized (creating) {
            Row active = active(subject, key);
            if (active != null) return active;
            String yaml = gateway.call("draftInitial").asText();
            String id = "draft_" + UUID.randomUUID().toString().replace("-", "");
            String now = KitJson.now();
            return transactions.run(() -> {
                dao.insertDraft(id, subject, keyHash(key), now, now);
                dao.insertDocument(id, yaml);
                return owned(id, subject);
            });
        }
    }

    Object view(Row row) {
        if (row == null) return null;
        String id = row.text("draft_id");
        String status = row.text("status");
        String recovery = status.equals("published") ? row.yes("cleanup_pending") ? "finalize" : "none"
            : row.text("phase").equals("editable") ? "replan" : proof(row) != null ? "finalize" : "read_result";
        Map<String, Object> result = KitJson.fields("draft_id", id, "project_name", id, "status", status,
            "resources", publicBindings(row), "cleanup_pending", row.yes("cleanup_pending"), "recovery_action", recovery,
            "created_at", row.text("created_at"), "updated_at", row.text("updated_at"));
        if (row.text("operation_id") != null) result.put("operation_id", row.text("operation_id"));
        return result;
    }

    List<JsonNode> publicBindings(Row row) {
        List<JsonNode> bindings = new ArrayList<>();
        json.stored(row.get("resources_json")).forEach(item -> {
            if (!"skill".equals(item.path("type").asText())) bindings.add(item);
        });
        return bindings;
    }

    JsonNode invoke(String id, String action, Object... args) {
        checkId(id);
        return gateway.call("draftInvoke", id, action, java.util.Arrays.asList(args));
    }

    void editable(Row row) {
        if (!"editable".equals(row.text("phase")) || "published".equals(row.text("status")))
            throw KitError.conflict("发布执行中或结果待核对");
    }

    void checkCleanupKey(Row row, String key) {
        if (!java.util.Objects.equals(row.text("cleanup_key_hash"), keyHash(key))) {
            throw new KitError("conflict", 409, "已有批次属于另一浏览器或页面", false, Map.of("reason", "draft_owned_elsewhere"));
        }
    }

    private static String keyHash(String key) { return key == null ? null : Crypto.digest(key); }

    Row document(String id) {
        checkId(id);
        Row row = dao.findDocument(id);
        if (row == null) throw KitError.conflict("发布批次声明已清理");
        return row;
    }

    public Map<String, Object> documentView(String id) {
        Row document = document(id);
        return KitJson.fields("revision", document.integer("revision"), "yaml", document.text("yaml"),
            "sdk_state_json", document.text("sdk_state_json"), "assets_json", document.text("assets_json"));
    }

    public String edit(String id, JsonNode data) {
        String expected = data.path("revision").asText("");
        if (!expected.matches("[1-9][0-9]{0,14}") || !data.path("yaml").isTextual()) throw KitError.invalidRequest();
        return transactions.run(() -> {
            int changed = dao.updateDocument(data.get("yaml").asText(), data.path("assets").asText(null), id, Long.parseLong(expected), id);
            if (changed != 1) throw KitError.conflict("批次配置已变化，请重新加载");
            dao.deletePlan(id);
            dao.touch(KitJson.now(), id);
            return Long.toString(document(id).integer("revision"));
        });
    }

    JsonNode proof(Row draft) {
        Row record = dao.findProof(draft.text("draft_id"));
        if (record == null || record.get("proof_json") == null) return null;
        try {
            JsonNode proof = json.stored(record.get("proof_json"));
            return draft.text("draft_id").equals(proof.path("draft_id").asText())
                && draft.text("owner").equals(proof.path("owner").asText())
                && draft.text("expected_revision") != null
                && draft.text("expected_revision").equals(proof.path("project_revision").asText())
                && proof.path("required").isArray() ? proof : null;
        } catch (RuntimeException error) {
            return null;
        }
    }

    void acceptProof(Row draft, JsonNode data) {
        if (!draft.text("expected_revision").equals(data.path("project_revision").asText())
            || !data.path("required").isArray() || data.path("required").isEmpty()) throw KitError.conflict("发布成功证明不完整");
        ObjectNode proof = data.deepCopy();
        proof.put("draft_id", draft.text("draft_id"));
        proof.put("owner", draft.text("owner"));
        dao.updateProof(json.write(proof), draft.text("draft_id"));
    }

    void persistReceipt(Row draft, JsonNode bindings) {
        JsonNode proof = proof(draft);
        if (proof == null || !bindings.isArray() || proof.path("required").size() != bindings.size())
            throw KitError.conflict("尚无完整的发布成功证明和绑定");
        String id = draft.text("draft_id");
        Row document = document(id);
        if (!draft.text("expected_revision").equals(Long.toString(document.integer("revision"))))
            throw KitError.conflict("发布后的批次配置已变化");
        Set<String> required = new HashSet<>();
        proof.path("required").forEach(item -> required.add(bindingKey(item)));
        Map<String, String> state = new HashMap<>();
        json.stored(document.get("sdk_state_json")).path("resources").forEach(item -> {
            JsonNode addr = item.path("address");
            if ("bailian".equals(addr.path("provider").asText()))
                state.put(addr.path("type").asText() + ":" + addr.path("name").asText(), item.path("remote_id").asText());
        });
        for (JsonNode binding : bindings) {
            String key = bindingKey(binding);
            String remote = binding.path("remote_id").asText("");
            if (!required.remove(key) || remote.isEmpty() || !remote.equals(state.get(key))
                || "agent".equals(binding.path("type").asText()) && binding.path("version").asInt() < 1) {
                throw KitError.conflict("发布结果与持久化绑定不一致");
            }
        }
        if (!required.isEmpty()) throw KitError.conflict("发布结果缺少资源绑定");
        ObjectNode full = proof.deepCopy();
        full.set("resources", bindings);
        dao.updateProof(json.write(full), id);
        dao.savePublishedBindings(json.write(bindings), KitJson.now(), id);
    }

    private static String bindingKey(JsonNode item) { return item.path("type").asText() + ":" + item.path("id").asText(); }

    void cleanupPublished(String id) {
        Row draft = get(id);
        if (draft == null || !"published".equals(draft.text("status")) || !draft.yes("cleanup_pending")) return;
        Row document = dao.findProof(id);
        JsonNode proof = proof(draft);
        if (document != null && (proof == null || !proof.path("resources").isArray())) throw KitError.conflict("成功证明不完整");
        removeUploads(id);
        transactions.run(() -> {
            dao.deleteDocument(id);
            dao.completeCleanup(KitJson.now(), id);
            return null;
        });
        release(id);
    }

    void discard(Row row) {
        String id = row.text("draft_id");
        if (!row.text("phase").equals("editable"))
            throw new KitError("conflict", 409, "发布已开始或结果待核对", false, Map.of("reason", "publication_unresolved"));
        removeUploads(id);
        dao.deleteEditable(id);
        release(id);
    }

    private void release(String id) {
        try {
            gateway.call("draftRelease", id);
        } catch (KitError ignored) {
            // 批次已闭合，SDK 网关重启也会释放进程内资源。
        }
    }

    private void removeUploads(String id) {
        checkId(id);
        Path target = uploads.resolve(id);
        if (Files.isSymbolicLink(uploads) || Files.isSymbolicLink(target)) throw KitError.conflict("上传暂存目录不安全");
        if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)) return;
        if (!Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS)) throw KitError.conflict("上传暂存目录不安全");
        try (Stream<Path> entries = Files.walk(target)) {
            for (Path path : (Iterable<Path>) entries.sorted(Comparator.reverseOrder())::iterator) Files.delete(path);
        } catch (IOException error) {
            throw KitError.conflict("上传暂存清理失败");
        }
    }

    static void checkId(String id) {
        if (id == null || !id.matches("draft_[a-f0-9]{32}")) throw KitError.missing("资源发布批次不存在");
    }
}
