package poc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;
import reactor.core.publisher.Mono;

import javax.annotation.PreDestroy;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@RestController
final class PocSessions {
    private static final int REPLAY_LIMIT = 64;
    private static final int SNAPSHOT_LIMIT = 256;
    private final NodeClient node;
    private final PocAccess access;
    private final ScheduledExecutorService loop = Executors.newSingleThreadScheduledExecutor();
    private final Set<Client> clients = new HashSet<>();
    private final Map<String, Change> latest = new LinkedHashMap<>();
    private final ArrayDeque<Change> replay = new ArrayDeque<>();
    private final List<JsonNode> buffered = new ArrayList<>();
    private volatile boolean ready;
    private boolean started;
    private long generation;
    private long sequence;
    private String epoch;
    private Disposable stream;
    private Disposable history;

    PocSessions(NodeClient node, PocAccess access) {
        this.node = node;
        this.access = access;
        loop.scheduleAtFixedRate(this::ping, 15, 15, TimeUnit.SECONDS);
    }

    @GetMapping(value = "/api/kit/sessions/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter subscribe(@PathVariable String id, @RequestParam(required = false) String after,
                         @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer,
                         @RequestHeader(value = PocAccess.PROTOCOL_HEADER, required = false) String version) {
        access.session(bearer, id, version);
        Client client = new Client(after);
        client.emitter.onCompletion(() -> dispatch(() -> clients.remove(client)));
        client.emitter.onTimeout(() -> dispatch(() -> clients.remove(client)));
        client.emitter.onError(error -> dispatch(() -> clients.remove(client)));
        dispatch(() -> {
            clients.add(client);
            if (ready) subscribeReady(client);
            if (!started) {
                started = true;
                connect();
            }
        });
        return client.emitter;
    }

    @PostMapping("/api/kit/sessions/{id}/messages")
    Map<String, Object> send(@PathVariable String id, @RequestBody JsonNode request,
                             @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer,
                             @RequestHeader(value = PocAccess.PROTOCOL_HEADER, required = false) String version) {
        access.session(bearer, id, version);
        JsonNode text = request.path("text");
        if (!text.isTextual() || text.asText().isBlank() || text.asText().length() > 4096)
            throw PocFailure.invalid();
        if (!ready) throw PocFailure.conflict("会话尚未就绪");
        try {
            JsonNode result = node.send(text.asText());
            if (result == null || !result.path("event_ids").isArray())
                throw new IllegalStateException("消息回执缺失");
            return Map.of("data", Map.of("session_id", id, "accepted", true, "event_ids", result.path("event_ids")));
        } catch (RuntimeException error) {
            throw new PocFailure(502, "provider_error", "消息写入结果待核对");
        }
    }

    private void connect() {
        long current = ++generation;
        history = null;
        stream = node.stream().subscribe(
            frame -> dispatch(() -> receive(current, frame)),
            error -> dispatch(() -> disconnected(current)),
            () -> dispatch(() -> disconnected(current))
        );
    }

    private void receive(long current, ServerSentEvent<JsonNode> frame) {
        if (generation != current) return;
        if ("ready".equals(frame.event()) && !ready && history == null) {
            history = history(null, new ArrayList<>(), new HashSet<>()).subscribe(
                events -> dispatch(() -> initialize(current, events)),
                error -> dispatch(() -> disconnected(current))
            );
        } else if ("event".equals(frame.event()) && frame.data() != null) {
            if (ready) append(frame.data(), true);
            else if (buffered.size() < SNAPSHOT_LIMIT) buffered.add(frame.data());
            else disconnected(current);
        }
    }

    private Mono<List<JsonNode>> history(String page, List<JsonNode> events, Set<String> seen) {
        return node.history(page).flatMap(data -> {
            JsonNode list = data.path("events");
            if (!list.isArray() || list.size() + events.size() > SNAPSHOT_LIMIT)
                return Mono.error(new IllegalStateException("历史快照超出 PoC 范围"));
            list.forEach(events::add);
            String next = data.path("next_page_token").asText(null);
            if (next == null) return Mono.just(events);
            if (!seen.add(next) || seen.size() >= 16)
                return Mono.error(new IllegalStateException("历史分页游标不收敛"));
            return history(next, events, seen);
        });
    }

    private void initialize(long current, List<JsonNode> events) {
        if (generation != current) return;
        Map<String, JsonNode> hydrated = accumulate(events);
        try {
            for (Map.Entry<String, JsonNode> update : accumulate(buffered).entrySet()) {
                JsonNode previous = hydrated.get(update.getKey());
                JsonNode incoming = update.getValue();
                if (previous == null || eventId(incoming) == null) {
                    hydrated.put(key(incoming, hydrated.size()), incoming);
                    continue;
                }
                JsonNode merged = merge(previous, incoming);
                if (!previous.equals(merged) && !("in_progress".equals(status(previous)) && "completed".equals(status(incoming))))
                    throw new IllegalStateException("历史与实时快照顺序未知");
                hydrated.put(update.getKey(), merged);
            }
            if (hydrated.size() > SNAPSHOT_LIMIT) throw new IllegalStateException("会话快照超出 PoC 范围");
        } catch (IllegalStateException conflict) {
            broadcast("error", null, Map.of("code", "provider_error", "message", conflict.getMessage(), "retryable", true));
            disconnected(current);
            return;
        }

        latest.clear();
        replay.clear();
        epoch = UUID.randomUUID().toString();
        sequence = 0;
        buffered.clear();
        hydrated.values().forEach(event -> append(event, false));
        ready = true;
        new ArrayList<>(clients).forEach(this::subscribeReady);
    }

    private void disconnected(long current) {
        if (generation != current) return;
        generation++;
        ready = false;
        buffered.clear();
        if (stream != null) stream.dispose();
        if (history != null) history.dispose();
        loop.schedule(this::connect, 150, TimeUnit.MILLISECONDS);
    }

    private void subscribeReady(Client client) {
        Long after = parseCursor(client.after);
        List<Change> changes;
        if (after == null) {
            sendFrame(client, "reset", null, Map.of("session_id", PocAccess.SESSION_ID));
            changes = new ArrayList<>(latest.values());
            changes.sort((a, b) -> Long.compare(a.sequence, b.sequence));
        } else {
            changes = replay.stream().filter(change -> change.sequence > after).collect(Collectors.toList());
        }
        for (Change change : changes) sendFrame(client, "event", cursor(change.sequence), change.data);
        ObjectNode result = JsonNodeFactory.instance.objectNode().put("session_id", PocAccess.SESSION_ID)
            .put("replayed", changes.size()).put("cursor", cursor(sequence));
        if (client.after == null) result.putNull("after");
        else result.put("after", client.after);
        sendFrame(client, "ready", null, result);
        client.after = cursor(sequence);
    }

    private Long parseCursor(String value) {
        if (value == null || !value.startsWith(epoch + ":")) return null;
        try {
            long n = Long.parseLong(value.substring(epoch.length() + 1));
            long oldest = replay.isEmpty() ? sequence : replay.getFirst().sequence - 1;
            return n >= oldest && n <= sequence ? n : null;
        } catch (NumberFormatException invalid) {
            return null;
        }
    }

    private void append(JsonNode incoming, boolean live) {
        String key = key(incoming, latest.size());
        Change prior = latest.get(key);
        JsonNode data = merge(prior == null ? null : prior.data, incoming);
        if (prior != null && prior.data.equals(data)) return;
        if (prior == null && latest.size() >= SNAPSHOT_LIMIT) {
            disconnected(generation);
            return;
        }
        Change change = new Change(++sequence, data);
        latest.put(key, change);
        replay.addLast(change);
        if (replay.size() > REPLAY_LIMIT) replay.removeFirst();
        if (live) {
            broadcast("event", cursor(change.sequence), data);
            clients.forEach(client -> client.after = cursor(change.sequence));
        }
    }

    private static Map<String, JsonNode> accumulate(List<JsonNode> snapshots) {
        Map<String, JsonNode> result = new LinkedHashMap<>();
        for (JsonNode snapshot : snapshots) {
            String key = key(snapshot, result.size());
            result.put(key, merge(result.get(key), snapshot));
        }
        return result;
    }

    private static String eventId(JsonNode data) {
        return data.path("event_id").asText(null);
    }

    private static String key(JsonNode data, int fallback) {
        String id = eventId(data);
        return id == null ? "position:" + fallback : "event:" + id;
    }

    private static String status(JsonNode event) {
        return event.path("metadata").path("event_status").asText();
    }

    private static JsonNode merge(JsonNode previous, JsonNode incoming) {
        if (previous == null) return incoming;
        if ("completed".equals(status(previous)) && "in_progress".equals(status(incoming))) return previous;
        ObjectNode result = previous.deepCopy();
        result.setAll((ObjectNode) incoming);
        if (incoming.path("metadata").isObject()) {
            ObjectNode metadata = JsonNodeFactory.instance.objectNode();
            if (previous.path("metadata").isObject()) metadata.setAll((ObjectNode) previous.path("metadata"));
            metadata.setAll((ObjectNode) incoming.path("metadata"));
            result.set("metadata", metadata);
        }
        return result;
    }

    private String cursor(long n) {
        return epoch + ":" + n;
    }

    private void ping() {
        broadcast("ping", null, Map.of("t", System.currentTimeMillis()));
    }

    private void broadcast(String event, String id, Object data) {
        new ArrayList<>(clients).forEach(client -> sendFrame(client, event, id, data));
    }

    private void sendFrame(Client client, String event, String id, Object data) {
        if (!clients.contains(client)) return;
        SseEmitter.SseEventBuilder frame = SseEmitter.event().name(event).data(data, MediaType.APPLICATION_JSON);
        if (id != null) frame.id(id);
        try {
            client.emitter.send(frame);
        } catch (IOException | IllegalStateException closed) {
            clients.remove(client);
        }
    }

    private void dispatch(Runnable task) {
        try {
            loop.execute(task);
        } catch (RejectedExecutionException closed) {
            if (!loop.isShutdown()) throw closed;
        }
    }

    @PreDestroy
    void close() {
        loop.shutdownNow();
        if (stream != null) stream.dispose();
        if (history != null) history.dispose();
    }

    private static final class Client {
        final SseEmitter emitter = new SseEmitter(0L);
        String after;
        Client(String after) { this.after = after; }
    }

    private static final class Change {
        final long sequence;
        final JsonNode data;
        Change(long sequence, JsonNode data) {
            this.sequence = sequence;
            this.data = data;
        }
    }
}
