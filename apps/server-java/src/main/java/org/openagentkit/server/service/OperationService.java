package org.openagentkit.server.service;

import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.OperationDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

import javax.annotation.PreDestroy;

@Service
public final class OperationService {
    private static final Set<String> TERMINAL = Set.of("succeeded", "failed", "cancelled");
    private final OperationDao dao;
    private final KitJson json;
    private final ExecutorService observers = new ThreadPoolExecutor(0, 64, 30, TimeUnit.SECONDS, new SynchronousQueue<>());

    OperationService(OperationDao dao, KitJson json) {
        this.dao = dao;
        this.json = json;
    }

    private Row require(String id, String subject) {
        Row row = dao.findVisible(id, subject);
        if (row == null) throw KitError.missing("operation 不存在");
        return row;
    }

    private Map<String, Object> view(Row row) {
        Map<String, Object> result = KitJson.fields("operation_id", row.text("operation_id"), "kind", row.text("kind"),
            "status", row.text("status"), "progress", row.decimal("progress"), "log", json.stored(row.get("log")),
            "created_at", row.text("created_at"), "updated_at", row.text("updated_at"));
        SessionService.put(result, row, "phase");
        SessionService.put(result, row, "error");
        if (row.get("result") != null) result.put("result", json.stored(row.get("result")));
        if (row.get("publication_json") != null) result.put("publication", json.stored(row.get("publication_json")));
        if (row.get("error_details_json") != null) result.put("error_details", json.stored(row.get("error_details_json")));
        return result;
    }

    public void subscribe(RequestContext call, EventSink sink) {
        String id = call.id("operationId");
        String subject = call.subject();
        require(id, subject);
        AtomicBoolean closed = new AtomicBoolean();
        sink.onClose(() -> closed.set(true));
        try {
            observers.execute(() -> {
                Map<String, Object> previous = null;
                long ping = System.currentTimeMillis();
                try {
                    while (!closed.get()) {
                        Row row = require(id, subject);
                        Map<String, Object> current = view(row);
                        String status = row.text("status");
                        if (!current.equals(previous)) {
                            sink.send("operation", null, current);
                            previous = current;
                        }
                        if (TERMINAL.contains(status)) {
                            sink.send("done", null, KitJson.fields("session_id", id, "status", status,
                                "last_event_id", null, "reason", "operation_closed"));
                            break;
                        }
                        long now = System.currentTimeMillis();
                        if (now - ping >= 15_000) {
                            sink.send("ping", null, Map.of("t", now));
                            ping = now;
                        }
                        Thread.sleep(250);
                    }
                } catch (IOException | RuntimeException ignored) {
                    // 观察流独立于 SDK 执行。
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                } finally {
                    sink.complete();
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException error) {
            throw KitError.provider("Operation 观察流繁忙");
        }
    }

    @PreDestroy
    void close() {
        observers.shutdownNow();
    }

    public Object list(String subject, int limit) {
        return KitJson.data(dao.listVisible(subject, limit)
            .stream().map(this::view).collect(Collectors.toList()));
    }

    public Object detail(String id, String subject) {
        return KitJson.data(view(require(id, subject)));
    }
}
