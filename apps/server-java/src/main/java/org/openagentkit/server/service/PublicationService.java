package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.PublicationDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.support.Crypto;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import javax.annotation.PreDestroy;

@Service
public final class PublicationService implements ApplicationRunner {
    private static final String KIND = "resourceDraft.publish";
    private final PublicationDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final GatewayClient gateway;
    private final DraftService drafts;
    private final Confirmations confirmations;
    private final ScheduledExecutorService monitor = Executors.newSingleThreadScheduledExecutor();
    private final ThreadPoolExecutor commands = new ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32));
    private final java.util.concurrent.atomic.AtomicInteger sdkUnreachable = new java.util.concurrent.atomic.AtomicInteger();

    PublicationService(PublicationDao dao, KitTransactions transactions, KitJson json, GatewayClient gateway, DraftService drafts, Confirmations confirmations) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.gateway = gateway;
        this.drafts = drafts;
        this.confirmations = confirmations;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        recoverLegacy();
        monitor.scheduleWithFixedDelay(this::scan, 1, 2, TimeUnit.SECONDS);
    }

    private void recoverLegacy() {
        transactions.run(() -> {
            for (Row row : dao.listInterruptedLegacyOperations()) {
                String operation = row.text("operation_id");
                String failure = "服务已重启，操作结果待核对";
                boolean publication = KIND.equals(row.text("kind"));
                dao.interruptLegacyOperation(failure,
                    publication ? json.write(report(null, "unknown", true)) : row.text("publication_json"),
                    publication ? json.write(details("publication.interrupted", "interrupted", true)) : row.text("error_details_json"),
                    KitJson.now(),
                    operation);
                dao.markLegacyDraftUncertain(KitJson.now(), operation);
            }
            return null;
        });
    }

    Map<String, Object> plan(Row row) {
        String id = row.text("draft_id");
        drafts.editable(row);
        JsonNode expected = drafts.invoke(id, "plan");
        if (!expected.path("project_revision").isTextual() || !expected.path("fingerprint").isTextual()
            || !expected.path("diff").isArray()) throw KitError.provider("SDK 计划响应不完整");
        String plan = "plan_" + UUID.randomUUID();
        boolean destructive = false;
        for (JsonNode entry : expected.path("diff")) destructive |= entry.path("destructive").asBoolean();
        Map<String, Object> view = confirmations.plan(plan, KIND, row.text("owner"), expected.get("diff"), destructive);
        view.put("project_revision", expected.get("project_revision"));
        if (expected.hasNonNull("yaml_hash")) view.put("yaml_hash", expected.get("yaml_hash"));
        view.put("fingerprint", expected.get("fingerprint"));
        dao.savePlan(id, plan, json.write(expected), view.get("expires_at"));
        return view;
    }

    String start(Row row, RequestContext call) {
        String draft = row.text("draft_id");
        String operation = "op_" + UUID.randomUUID();
        transactions.run(() -> {
            Row plan = dao.findPlan(draft);
            if (plan == null || !plan.text("plan_id").equals(call.value("plan_id"))
                || !Instant.parse(plan.text("expires_at")).isAfter(Instant.now())) {
                throw new KitError("confirmation_required", 428, "发布计划不存在或已过期，请重新预览");
            }
            drafts.editable(row);
            String expected = json.stored(plan.get("plan_json")).path("project_revision").asText();
            if (!expected.equals(Long.toString(drafts.document(draft).integer("revision"))))
                throw KitError.conflict("批次配置已变化，请重新预览");
            confirmations.consume(call, KIND, "plan_");
            String now = KitJson.now();
            dao.insertOperation(operation, KIND, call.subject(), now, now);
            dao.insertClaim(operation, draft, plan.text("plan_json"), now);
            int step = dao.markDraftPublishing(operation, expected, now, draft);
            if (step != 1) throw KitError.conflict("资源批次正在发布或收尾");
            dao.deletePlan(draft);
            return null;
        });
        try {
            commands.execute(() -> {
                try {
                    gateway.call("draftExecute", draft, operation);
                } catch (KitError ignored) {
                    // HTTP 响应丢失无法判断是否已认领。由持久账本与 Node 实例检测决定终态。
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            abandon(operation, null, true);
        }
        return operation;
    }

    public JsonNode claim(String id, JsonNode body) {
        String instance = instance(body);
        return transactions.run(() -> {
            Row claim = claimRow(id);
            if (!claim.text("draft_id").equals(body.path("draft_id").asText()) || !claim.text("status").equals("pending"))
                throw KitError.conflict("发布已经认领或批次不匹配");
            String now = KitJson.now();
            int changed = dao.claim(instance, now, id);
            if (changed != 1) throw KitError.conflict("发布已被认领");
            dao.markRunning(now, id);
            return json.stored(claim.get("plan_json"));
        });
    }

    public Object grant(String id, JsonNode data) {
        String instance = instance(data);
        transactions.run(() -> {
            Row row = claimRow(id);
            requireInstance(row, instance);
            if (!row.text("status").equals("running") || row.yes("mutation_granted")) throw KitError.conflict("执行许可已消费");
            Row draft = drafts.get(row.text("draft_id"));
            if (draft == null || !id.equals(draft.text("operation_id")) || !draft.text("phase").equals("executing"))
                throw KitError.conflict("发布批次状态已变更");
            dao.grantWrites(KitJson.now(), id);
            dao.markExecuting(KitJson.now(), id);
            return null;
        });
        return true;
    }

    public Object checkpoint(String id, JsonNode data) {
        String instance = instance(data);
        long sequence = data.path("sequence").asLong(0);
        if (sequence < 1 || sequence > 1_000_000) throw KitError.invalidRequest();
        String digest = Crypto.digest(json.write(data));
        Row initial = claimRow(id);
        String draftId = initial.text("draft_id");
        // 结果已写时允许同序号原样回写，任何不同顺序或内容均拒绝。
        boolean cleanup = transactions.run(() -> {
            Row row = claimRow(id);
            requireInstance(row, instance);
            Row known = dao.findCheckpoint(id, sequence);
            if (known != null) {
                if (!known.text("payload_hash").equals(digest)) throw KitError.conflict("检查点内容与已接收记录不一致");
                return false;
            }
            if (!row.text("status").equals("running")) throw KitError.conflict("Operation 已经结束");
            long previous = dao.latestSequence(id).integer("n");
            if (sequence != previous + 1) throw KitError.conflict("检查点序号不连续");
            Row draft = drafts.get(draftId);
            if (draft == null || !id.equals(draft.text("operation_id"))) throw KitError.conflict("发布批次状态已变更");
            String kind = data.path("kind").asText();
            JsonNode payload = data.path("payload");
            if (!row.yes("mutation_granted") && !kind.equals("failure")) throw KitError.conflict("发布执行尚未获得许可");
            boolean finish = applyCheckpoint(id, draft, row, kind, payload);
            dao.insertCheckpoint(id, sequence, digest);
            dao.touchClaim(KitJson.now(), id);
            return finish;
        });
        if (cleanup) {
            drafts.lock(draftId, () -> {
                try {
                    drafts.cleanupPublished(draftId);
                    dao.markSucceeded(KitJson.now(), id);
                } catch (KitError error) {
                    dao.markCleanupFailure("资源已发布，批次清理待恢复", json.write(details("publication.cleanup_failed", "cleanup", true)), KitJson.now(), id);
                }
                return null;
            });
        }
        return true;
    }

    private boolean applyCheckpoint(String id, Row draft, Row row, String kind, JsonNode payload) {
        String draftId = draft.text("draft_id");
        String now = KitJson.now();
        switch (kind) {
            case "state":
                if (!payload.isTextual() || !json.stored(payload.asText()).path("resources").isArray())
                    throw KitError.invalid("SDK 检查点格式不符");
                dao.saveSdkState(payload.asText(), draftId);
                return false;
            case "report":
                dao.saveProviderResult(json.write(payload), now, id);
                return false;
            case "proof":
                drafts.acceptProof(draft, payload);
                dao.markSavingReceipt(now, id);
                return false;
            case "result":
                drafts.persistReceipt(draft, payload.path("bindings"));
                dao.saveResult(json.write(payload.path("result")), now, id);
                return true;
            case "failure":
                JsonNode details = payload.path("error_details");
                JsonNode report = payload.path("publication");
                boolean mutation = details.path("mutation_started").asBoolean(row.yes("mutation_granted"));
                fail(id, draftId, report, details, mutation, "发布未完成，请根据阶段处理");
                return false;
            default:
                throw KitError.invalid("未知 SDK 检查点类型");
        }
    }

    void finalizeDraft(Row draft) {
        String id = draft.text("draft_id");
        if (!"published".equals(draft.text("status"))) {
            if ("publishing".equals(draft.text("status"))) throw KitError.conflict("发布正在进行");
            JsonNode proof = drafts.proof(draft);
            if (proof == null) throw KitError.conflict("缺少发布成功证明");
            JsonNode bindings = proof.has("resources") ? proof.get("resources") : drafts.invoke(id, "publicationBindings");
            transactions.run(() -> {
                drafts.persistReceipt(draft, bindings);
                return null;
            });
        }
        drafts.cleanupPublished(id);
    }

    private void scan() {
        try {
            for (Row row : dao.listActiveClaims()) {
                String id = row.text("operation_id");
                Row draft = drafts.get(claimRow(id).text("draft_id"));
                if (draft != null && "published".equals(draft.text("status"))) {
                    if (!draft.yes("cleanup_pending")) {
                        dao.markSucceeded(KitJson.now(), id);
                    } else if (Instant.parse(row.text("updated_at")).plusSeconds(60).isBefore(Instant.now())) {
                        dao.markRunningCleanupFailure("发布回执已保存，等待收尾",
                    json.write(details("publication.cleanup_failed", "cleanup", true)),
                    KitJson.now(),
                    id);
                    }
                    continue;
                }
                String worker = row.text("node_instance");
                if (worker == null) {
                    if (Instant.parse(row.text("updated_at")).plusSeconds(30).isBefore(Instant.now())) abandon(id, null, true);
                    continue;
                }
                try {
                    String instance = gateway.health().path("instance_id").asText();
                    sdkUnreachable.set(0);
                    if (!instance.equals(worker) || !gateway.call("draftActive", row.text("draft_id"), id).path("active").asBoolean()) {
                        abandon(id, worker, false);
                    }
                } catch (KitError error) {
                    if (sdkUnreachable.incrementAndGet() > 30) abandon(id, worker, false);
                }
            }
        } catch (RuntimeException error) {
            // 保留数据库中的最后安全阶段，下一轮继续只读核对。
        }
    }

    private void abandon(String id, String instance, boolean unclaimed) {
        transactions.run(() -> {
            Row operation = claimRow(id);
            if (unclaimed && !operation.text("status").equals("pending")
                || !unclaimed && (!operation.text("status").equals("running") || !instance.equals(operation.text("node_instance")))) return null;
            boolean started = operation.yes("mutation_granted");
            String draft = operation.text("draft_id");
            Row publication = drafts.get(draft);
            if (publication != null && "published".equals(publication.text("status"))) return null;
            fail(id, draft, report(draft, started ? "unknown" : "failed", started),
                json.mapper.valueToTree(details(unclaimed ? "publication.dispatch_failed" : "publication.interrupted",
                    unclaimed ? "prepare" : "interrupted", started)), started, "执行已中断，请根据远端结果核对");
            return null;
        });
    }

    private void fail(String operation, String draft, JsonNode report, JsonNode details, boolean started, String message) {
        String now = KitJson.now();
        dao.markFailed(details.path("phase").asText("interrupted"), message, json.write(report), json.write(details), now, operation);
        dao.markDraftFailed(started ? "uncertain" : "editable", now, draft);
    }

    private JsonNode report(String draft, String outcome, boolean started) {
        ObjectNode report = json.object().put("outcome", outcome).put("mutation_started", started);
        ArrayNode resources = report.putArray("resources");
        if (draft == null) return report;
        Row state = dao.findSdkState(draft);
        if (state == null) return report;
        for (JsonNode entry : json.stored(state.get("sdk_state_json")).path("resources")) {
            JsonNode address = entry.path("address");
            if (!entry.path("remote_id").isTextual() || !"bailian".equals(address.path("provider").asText())) continue;
            ObjectNode available = resources.addObject().put("type", address.path("type").asText())
                .put("id", address.path("name").asText()).put("status", "succeeded").put("remote_id", entry.path("remote_id").asText());
            if (entry.path("version").isIntegralNumber()) available.set("version", entry.get("version"));
        }
        return report;
    }

    private static Map<String, Object> details(String code, String phase, boolean started) {
        return Map.of("code", code, "phase", phase, "retryable", false, "mutation_started", started);
    }

    private Row claimRow(String id) {
        Row row = dao.findClaim(id);
        if (row == null) throw KitError.missing("Operation 不存在");
        return row;
    }

    private static String instance(JsonNode body) {
        String value = body.path("instance").asText("");
        if (!value.matches("[a-f0-9-]{36}")) throw KitError.invalidRequest();
        return value;
    }

    private static void requireInstance(Row row, String instance) {
        if (!instance.equals(row.text("node_instance"))) throw KitError.conflict("执行实例不匹配");
    }

    @PreDestroy
    void shutdown() {
        monitor.shutdownNow();
        commands.shutdownNow();
    }
}
