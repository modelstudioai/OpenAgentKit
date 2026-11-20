package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.SessionDao;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import reactor.core.Disposable;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import javax.annotation.PreDestroy;

@Service
final class SessionStreams {
    private static final int MAX_REPLAY_FRAMES = 1024;
    private static final int MAX_REPLAY_BYTES = 8 * 1024 * 1024;
    private static final int MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
    private static final int MAX_STREAMS = 256;
    private final GatewayClient gateway;
    private final SessionEvents events;
    private final KitJson json;
    private final SessionDao dao;
    private final AuthService access;
    private final Map<String, Pump> pumps = new ConcurrentHashMap<>();
    private final ScheduledExecutorService timers = Executors.newScheduledThreadPool(2);
    private final ThreadPoolExecutor reads = new ThreadPoolExecutor(4, 8, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(64));
    private final ThreadPoolExecutor writes = new ThreadPoolExecutor(0, MAX_STREAMS * 2, 30, TimeUnit.SECONDS, new SynchronousQueue<>());

    SessionStreams(GatewayClient gateway, SessionEvents events, KitJson json, SessionDao dao, AuthService access) {
        this.gateway = gateway;
        this.events = events;
        this.json = json;
        this.dao = dao;
        this.access = access;
        timers.scheduleAtFixedRate(() -> pumps.values().forEach(Pump::heartbeat), 15, 15, TimeUnit.SECONDS);
    }

    void subscribe(String id, RequestContext call, EventSink sink) {
        Client client = new Client(call.identity, call.query("after"), sink);
        Pump pump = get(id);
        client.remove = () -> pump.remove(client);
        client.release = access.watch(client.principal, client::unauthorized);
        sink.onClose(client::close);
        if (client.principal.expires != null) {
            long delay = Math.max(0, Duration.between(Instant.now(), client.principal.expires).toMillis());
            client.expiry = timers.schedule(client::unauthorized, delay, TimeUnit.MILLISECONDS);
        }
        try {
            writes.execute(client::drain);
            pump.add(client);
        } catch (RuntimeException error) {
            client.close();
            throw error;
        }
    }

    private synchronized Pump get(String id) {
        Pump existing = pumps.get(id);
        if (existing != null) return existing;
        if (pumps.size() >= MAX_STREAMS) throw KitError.provider("当前会话订阅已满，请稍后重试");
        Pump pump = new Pump(id);
        pumps.put(id, pump);
        return pump;
    }

    Pump ready(String id) {
        Pump pump = get(id);
        try {
            pump.start().get(20, TimeUnit.SECONDS);
            return pump;
        } catch (TimeoutException error) {
            throw new KitError("conflict", 409, "会话尚未就绪，请稍后重试", true, null);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw KitError.provider("等待会话连接被取消");
        } catch (ExecutionException error) {
            throw KitError.provider("上游会话连接不可用");
        }
    }

    void done(String id, String status) {
        Pump pump = pumps.get(id);
        if (pump != null) pump.end(status);
    }

    boolean tracking(String id) {
        return pumps.containsKey(id);
    }

    List<JsonNode> current(String id) {
        Pump pump = pumps.get(id);
        return pump == null ? List.of() : pump.snapshot();
    }

    final class Pump {
        final String id;
        final Set<Client> clients = new HashSet<>();
        final ArrayDeque<Frame> replay = new ArrayDeque<>();
        final List<JsonNode> pending = new ArrayList<>();
        final Map<String, Frame> latest = new java.util.LinkedHashMap<>();
        final Map<String, Long> firstSeen = new java.util.HashMap<>();
        volatile long generation;
        CompletableFuture<Void> ready = new CompletableFuture<>();
        Disposable upstream;
        boolean hydrating;
        boolean connected;
        boolean stopped;
        long sequence;
        long updated;
        int replayBytes;
        int snapshotBytes;
        int pendingBytes;
        int failures;
        String epoch;
        String status;
        List<String> turnEvents = List.of();
        long after;
        long detachedAt = System.currentTimeMillis();

        Pump(String id) {
            this.id = id;
        }

        synchronized CompletableFuture<Void> start() {
            if (stopped) throw KitError.conflict("会话已关闭");
            if (generation == 0) connect();
            return ready;
        }

        synchronized void add(Client client) {
            if (client.closed) return;
            clients.add(client);
            start();
            if (connected) replay(client);
        }

        synchronized void remove(Client client) {
            clients.remove(client);
            if (clients.isEmpty()) detachedAt = System.currentTimeMillis();
        }

        synchronized List<JsonNode> snapshot() {
            List<JsonNode> result = new ArrayList<>(latest.size());
            latest.values().forEach(frame -> result.add((JsonNode) frame.data));
            return result;
        }

        synchronized long position() {
            return updated;
        }

        synchronized void accepted(List<String> ids, long previous) {
            this.turnEvents = new ArrayList<>(ids);
            this.after = previous;
            updateStatus();
        }

        synchronized void ensureWritable() {
            if (!connected || stopped) throw KitError.conflict("会话尚未就绪，请稍后重试");
        }

        private synchronized void connect() {
            if (stopped) return;
            long attempt = ++generation;
            upstream = gateway.stream(id).timeout(Duration.ofSeconds(45)).subscribe(
                frame -> receive(attempt, frame),
                error -> disconnected(attempt),
                () -> disconnected(attempt));
        }

        synchronized void receive(long attempt, ServerSentEvent<String> frame) {
            if (attempt != generation || stopped) return;
            try {
                switch (frame.event() == null ? "" : frame.event()) {
                    case "ready":
                        if (!hydrating && !connected) {
                            hydrating = true;
                            reads.execute(() -> hydrate(attempt));
                        }
                        break;
                    case "event":
                        JsonNode event = json.stored(frame.data());
                        if (!event.isObject()) throw KitError.provider("上游事件格式无效");
                        if (connected) apply(event);
                        else {
                            pendingBytes += events.size(event);
                            if (pending.size() >= MAX_REPLAY_FRAMES || pendingBytes > MAX_REPLAY_BYTES) {
                                throw KitError.provider("历史回放期间实时事件缓冲超过上限");
                            }
                            pending.add(event);
                        }
                        break;
                    case "error":
                        JsonNode error = json.stored(frame.data());
                        if (!error.path("retryable").asBoolean()) {
                            fail(KitError.provider("上游事件连接被拒绝或协议不兼容"));
                        } else disconnected(attempt);
                        break;
                    default:
                        break;
                }
            } catch (RuntimeException error) {
                disconnected(attempt);
            }
        }

        void hydrate(long attempt) {
            try {
                List<JsonNode> history = events.history(id, () -> attempt != generation);
                synchronized (this) {
                    if (attempt != generation || stopped) return;
                    Map<String, JsonNode> reconciled = SessionEvents.reconcile(history, pending);
                    epoch = UUID.randomUUID().toString();
                    sequence = 0;
                    replayBytes = 0;
                    snapshotBytes = 0;
                    replay.clear();
                    latest.clear();
                    firstSeen.keySet().retainAll(reconciled.keySet());
                    for (Map.Entry<String, JsonNode> entry : reconciled.entrySet()) {
                        remember(entry.getKey(), entry.getValue());
                    }
                    pending.clear();
                    pendingBytes = 0;
                    failures = 0;
                    hydrating = false;
                    connected = true;
                    clients.forEach(this::replay);
                    ready.complete(null);
                    updateStatus();
                }
            } catch (RuntimeException error) {
                disconnected(attempt);
            }
        }

        private void apply(JsonNode event) {
            String key = event.path("event_id").asText("#" + (sequence + 1));
            if (key.isEmpty()) key = "#" + (sequence + 1);
            Frame previous = latest.get(key);
            JsonNode known = previous == null ? null : (JsonNode) previous.data;
            JsonNode current = SessionEvents.merge(known, event);
            if (current == known) return;
            Frame frame = remember(key, current);
            for (Client client : new ArrayList<>(clients)) client.offer(List.of(frame));
            if (SessionEvents.status(event) != null || !turnEvents.isEmpty()) updateStatus();
        }

        private Frame remember(String key, JsonNode event) {
            Frame previous = latest.get(key);
            int bytes = events.size(event);
            int nextBytes = snapshotBytes + bytes - (previous == null ? 0 : previous.bytes);
            if (nextBytes > MAX_SNAPSHOT_BYTES || previous == null && latest.size() >= 50_000)
                throw KitError.provider("会话事件缓存超过上限");
            firstSeen.putIfAbsent(key, ++updated);
            Frame frame = new Frame("event", cursor(++sequence), event, false, bytes);
            latest.put(key, frame);
            snapshotBytes = nextBytes;
            replay.addLast(frame);
            replayBytes += frame.bytes;
            while (replay.size() > MAX_REPLAY_FRAMES || replayBytes > MAX_REPLAY_BYTES) replayBytes -= replay.removeFirst().bytes;
            return frame;
        }

        private void replay(Client client) {
            String after = client.cursor;
            Long sequence = parse(after);
            List<Frame> frames = new ArrayList<>();
            if (sequence == null) {
                frames.add(new Frame("reset", null, Map.of("session_id", id), false, 0));
                frames.addAll(latest.values());
            } else {
                for (Frame frame : replay) {
                    if (Long.parseLong(frame.id.substring(epoch.length() + 1)) > sequence) frames.add(frame);
                }
            }
            int replayed = frames.size() - (sequence == null ? 1 : 0);
            frames.add(new Frame("ready", null, KitJson.fields("session_id", id, "after", after,
                "replayed", replayed, "cursor", cursor(this.sequence)), false, 0));
            client.cursor = cursor(this.sequence);
            client.offer(frames);
        }

        private Long parse(String cursor) {
            if (cursor == null || !cursor.startsWith(epoch + ":")) return null;
            try {
                long position = Long.parseLong(cursor.substring(epoch.length() + 1));
                long earliest = replay.isEmpty() ? sequence + 1 :
                    Long.parseLong(replay.peekFirst().id.substring(epoch.length() + 1));
                return position >= earliest - 1 && position <= sequence ? position : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }

        private String cursor(long sequence) {
            return epoch + ":" + sequence;
        }

        private void updateStatus() {
            List<JsonNode> snapshot = snapshot();
            String current = SessionEvents.latestStatus(snapshot);
            if (current == null) return;
            if (!turnEvents.isEmpty() && !SessionEvents.running(current) && !SessionEvents.removed(current)) {
                boolean ended = false;
                long echo = turnEvents.stream().mapToLong(id -> firstSeen.getOrDefault(id, 0L)).max().orElse(0L);
                if (echo > after) {
                    for (JsonNode event : snapshot) {
                        if (SessionEvents.status(event) != null && firstSeen.getOrDefault(event.path("event_id").asText(), 0L) > echo) {
                            ended = true;
                        }
                    }
                }
                if (!ended && !"requires_action".equals(current)) current = "running";
                if (ended) turnEvents = List.of();
            }
            if ("rescheduling".equals(current)) current = "running";
            if (!java.util.Objects.equals(status, current)) {
                status = current;
                String value = current;
                try {
                    reads.execute(() -> persistStatus(value));
                } catch (RejectedExecutionException ignored) {
                    // 持久索引可在下一次会话对账时补齐。
                }
            }
            if (SessionEvents.removed(current)) end(current);
        }

        private synchronized void persistStatus(String value) {
            if (java.util.Objects.equals(status, value)) {
                dao.updateStreamStatus(value, id);
            }
        }

        synchronized void disconnected(long attempt) {
            if (attempt != generation || stopped) return;
            generation++;
            if (upstream != null) upstream.dispose();
            if (connected) ready = new CompletableFuture<>();
            connected = false;
            hydrating = false;
            pending.clear();
            pendingBytes = 0;
            if (++failures > 8) {
                fail(KitError.provider("上游事件连接中断，请重新连接"));
                return;
            }
            long next = generation;
            timers.schedule(() -> {
                synchronized (this) {
                    if (generation == next) connect();
                }
            }, Math.min(5000, 200L << Math.min(failures - 1, 5)), TimeUnit.MILLISECONDS);
        }

        synchronized void end(String reason) {
            for (Client client : new ArrayList<>(clients)) {
                client.offer(List.of(new Frame("done", null, KitJson.fields("session_id", id, "status", reason,
                    "last_event_id", latest.values().stream().reduce((first, second) -> second)
                        .map(frame -> ((JsonNode) frame.data).path("event_id").asText(null)).orElse(null), "reason", reason,
                    "cursor", epoch == null ? null : cursor(sequence)), true, 0)));
            }
            stop();
        }

        synchronized void heartbeat() {
            if (stopped) return;
            if (clients.isEmpty()) {
                long allowed = SessionEvents.running(status) || !turnEvents.isEmpty() ? 30 * 60_000L : 15_000L;
                if (System.currentTimeMillis() - detachedAt > allowed) stop();
                return;
            }
            for (Client client : new ArrayList<>(clients)) {
                client.offer(List.of(new Frame("ping", null, Map.of("t", System.currentTimeMillis()), false, 0)));
            }
        }

        void fail(KitError error) {
            for (Client client : new ArrayList<>(clients)) {
                client.offer(List.of(new Frame("error", null, error.body().get("error"), true, 0)));
            }
            stop();
        }

        synchronized void stop() {
            if (stopped) return;
            stopped = true;
            generation++;
            if (upstream != null) upstream.dispose();
            ready.completeExceptionally(KitError.provider("会话连接已释放"));
            pumps.remove(id, this);
        }
    }

    private static final class Frame {
        final String type;
        final String id;
        final Object data;
        final boolean terminal;
        final int bytes;

        Frame(String type, String id, Object data, boolean terminal, int bytes) {
            this.type = type;
            this.id = id;
            this.data = data;
            this.terminal = terminal;
            this.bytes = bytes;
        }
    }

    private final class Client {
        final EventSink sink;
        final ArrayBlockingQueue<List<Frame>> outgoing = new ArrayBlockingQueue<>(128);
        final AuthService.Principal principal;
        volatile boolean closed;
        volatile String cursor;
        Runnable remove = () -> {};
        Runnable release = () -> {};
        java.util.concurrent.Future<?> expiry;

        Client(AuthService.Principal principal, String cursor, EventSink sink) {
            this.sink = sink;
            this.principal = principal;
            this.cursor = cursor;
        }

        void offer(List<Frame> frames) {
            if (closed) return;
            if (!outgoing.offer(frames)) timers.execute(this::close);
        }

        void unauthorized() {
            outgoing.clear();
            offer(List.of(new Frame("error", null, KitError.unauthorized().body().get("error"), true, 0)));
            timers.schedule(this::close, 250, TimeUnit.MILLISECONDS);
        }

        void drain() {
            try {
                while (!closed) {
                    List<Frame> frames = outgoing.poll(1, TimeUnit.SECONDS);
                    if (frames == null) continue;
                    for (Frame frame : frames) {
                        if (closed) return;
                        sink.send(frame.type, frame.id, frame.data);
                        if (frame.id != null) cursor = frame.id;
                        if (frame.terminal) return;
                    }
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            } catch (IOException | IllegalStateException ignored) {
                // 客户端断开只结束当前订阅。
            } finally {
                close();
            }
        }

        void close() {
            synchronized (this) {
                if (closed) return;
                closed = true;
                outgoing.clear();
            }
            if (expiry != null) expiry.cancel(false);
            release.run();
            remove.run();
            sink.complete();
        }
    }

    @PreDestroy
    void close() {
        pumps.values().forEach(pump -> pump.end("shutdown"));
        timers.shutdownNow();
        reads.shutdownNow();
        writes.shutdownNow();
    }
}
