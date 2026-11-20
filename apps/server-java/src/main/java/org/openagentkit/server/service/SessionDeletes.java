package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.SessionDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;

@Service
final class SessionDeletes {
    private final SessionDao dao;
    private final KitTransactions transactions;
    private final GatewayClient gateway;
    private final SessionEvents events;
    private final UsageLimitService usageLedger;

    SessionDeletes(SessionDao dao, KitTransactions transactions, GatewayClient gateway, SessionEvents events, UsageLimitService usageLedger) {
        this.dao = dao;
        this.transactions = transactions;
        this.gateway = gateway;
        this.events = events;
        this.usageLedger = usageLedger;
    }

    void requireWritable(String session) {
        if (dao.findDeletion(session) != null) {
            throw KitError.conflict("会话删除待核对，暂不能写入");
        }
    }

    void delete(Row row, boolean member) {
        String id = row.text("session_id");
        if (!member) {
            gateway.call("deleteSession", id);
            dao.deleteSession(id);
            return;
        }
        Row previous = dao.findDeletionStage(id);
        String previousStage = previous == null ? "" : previous.text("stage");
        boolean remoteStarted = Set.of("deleting", "uncertain").contains(previousStage);
        boolean keepProtection = previous != null;
        boolean stopped = false;
        String phase = remoteStarted ? "delete" : "stop";
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(30);
        try {
            writeStage(row, remoteStarted ? "uncertain" : "preparing");
            JsonNode info = gateway.call("getSession", id);
            if (remoteStarted) {
                if (info.isNull() && dao.findFinalizedUsage(id) != null) {
                    phase = "finalize";
                    finalizeDelete(id);
                    return;
                }
                throw KitError.conflict("删除结果待核对");
            }
            if (info.isNull()) throw KitError.conflict("Provider 会话不可查询");
            if (!stopped(id, info)) {
                keepProtection = true;
                gateway.call("interrupt", id);
                for (;;) {
                    if (System.nanoTime() >= deadline) throw KitError.conflict("尚未确认执行已停止");
                    SessionFiles.pause(500);
                    if (stopped(id, gateway.call("getSession", id))) break;
                }
            }
            stopped = true;
            phase = "capture";
            JsonNode latest = gateway.call("getSession", id);
            if (!stopped(id, latest) || System.nanoTime() >= deadline) throw KitError.conflict("会话状态发生变化");
            captureFinal(row, latest);
            phase = "delete";
            writeStage(row, "deleting");
            remoteStarted = true;
            try {
                gateway.call("deleteSession", id);
            } catch (RuntimeException error) {
                writeStage(row, "uncertain");
                if (!gateway.call("getSession", id).isNull()) throw error;
            }
            phase = "finalize";
            finalizeDelete(id);
        } catch (RuntimeException error) {
            if (!remoteStarted && !keepProtection) {
                try {
                    dao.deleteDeletion(id);
                } catch (RuntimeException ignored) {
                    // 数据库故障时保留保护阶段。
                }
            }
            String message;
            if ("finalize".equals(phase)) message = "远端会话已删除，用量快照已保存，本地删除状态待恢复，请重试";
            else if (remoteStarted) message = "删除结果尚未确认，用量快照已保存，请重试删除以核实状态";
            else if ("capture".equals(phase)) message = "执行已停止，用量保存失败，会话未删除，请重试";
            else message = "未能确认执行已停止，会话未删除，请重试";
            throw new KitError("conflict", 409, message, true,
                Map.of("stage", phase, "execution_stopped", stopped, "deletion_uncertain", remoteStarted && !phase.equals("finalize")));
        }
    }

    private boolean stopped(String id, JsonNode info) {
        String status = info.path("status").asText();
        if (Set.of("terminated", "archived", "stopped", "completed", "failed").contains(status)) return true;
        if (!status.equals("idle")) return false;
        if (info.path("stop_reason").isObject()) return !"requires_action".equals(info.path("stop_reason").path("type").asText());
        String latest = SessionEvents.latestStatus(events.history(id));
        return latest == null || latest.equals("idle");
    }

    private void captureFinal(Row index, JsonNode remote) {
        JsonNode usage = remote.path("usage");
        JsonNode stats = remote.path("stats");
        Object input = number(usage, "input_tokens");
        Object output = number(usage, "output_tokens");
        if (input == null || output == null) throw KitError.conflict("无法确认最新累计用量");
        String now = KitJson.now();
        usageLedger.serial(index.text("subject_id"), () -> transactions.run(() -> {
            dao.saveFinalUsage(index.text("session_id"),
                    index.text("subject_id"),
                    index.text("agent_slug"),
                    index.text("title"),
                    remote.path("status").asText(null),
                    index.text("created_at"),
                    input,
                    output,
                    number(usage, "cache_read_input_tokens"),
                    number(usage, "cache_creation_input_tokens"),
                    number(stats, "active_seconds"),
                    number(stats, "duration_seconds"),
                    number(stats, "active_seconds") == null || number(stats, "duration_seconds") == null
                    || number(usage, "cache_read_input_tokens") == null || number(usage, "cache_creation_input_tokens") == null
                    ? "partial" : "complete",
                    now,
                    now,
                    now);
            writeStage(index, "captured");
            usageLedger.captureFinal(index, remote);
            return null;
        }));
    }

    private static Object number(JsonNode node, String key) {
        JsonNode value = node.path(key);
        return value.isNumber() && Double.isFinite(value.asDouble()) && value.asDouble() >= 0 ? value.numberValue() : null;
    }

    private void writeStage(Row row, String stage) {
        dao.saveDeletion(row.text("session_id"), row.text("subject_id"), stage, KitJson.now());
    }

    private void finalizeDelete(String id) {
        transactions.run(() -> {
            dao.markUsageDeleted(KitJson.now(), id);
            dao.deleteSession(id);
            dao.deleteDeletion(id);
            return null;
        });
    }
}
