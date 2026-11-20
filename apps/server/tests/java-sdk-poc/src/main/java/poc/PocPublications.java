package poc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClientException;

import javax.annotation.PreDestroy;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
final class PocPublications {
    private static final String DRAFT_ROUTE = "/api/admin/resource-drafts/{draftId}";
    private static final String INTERNAL_OPERATION = "/internal/poc/operations/{id}";
    private final PocAccess access;
    private final NodeClient node;
    private final PublicationStore store;
    private final ObjectMapper json;
    private final JsonNode document;
    private final byte[] confirmSecret;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    PocPublications(PocAccess access, NodeClient node, PublicationStore store, ObjectMapper json,
                    Environment environment) throws IOException {
        this.access = access;
        this.node = node;
        this.store = store;
        this.json = json;
        confirmSecret = environment.getRequiredProperty("POC_CONFIRM_SECRET").getBytes(StandardCharsets.UTF_8);
        try (InputStream stream = getClass().getResourceAsStream("/poc-draft.yaml")) {
            if (stream == null) throw new IllegalStateException("缺少 PoC 批次声明");
            document = json.createObjectNode().put("revision", 1)
                .put("yaml", new String(stream.readAllBytes(), StandardCharsets.UTF_8))
                .put("sdk_state_json", "{\"resources\":[]}").put("assets_json", "[]");
        }
    }

    @PostMapping(DRAFT_ROUTE + "/resources/plan")
    Map<String, Object> plan(@PathVariable String draftId, @RequestBody JsonNode input,
                            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer) {
        access.draft(bearer, draftId);
        if (!"publish".equals(input.path("action").asText())) throw PocFailure.invalid();
        store.requirePublishable();
        JsonNode expected;
        try {
            expected = node.plan(document);
        } catch (RuntimeException unavailable) {
            throw new PocFailure(502, "provider_error", "Node 未能生成发布计划");
        }
        if (expected == null || !expected.path("diff").isArray() || expected.path("fingerprint").asText().isBlank())
            throw new PocFailure(502, "provider_error", "Node 返回的发布计划缺失");
        long expires = Instant.now().plus(Duration.ofMinutes(5)).toEpochMilli();
        PublicationStore.Plan plan = new PublicationStore.Plan(UUID.randomUUID().toString(), expected, expires, false);
        store.savePlan(plan);
        return Map.of("data", Map.of("plan_id", plan.id, "confirm_token", confirmToken(plan),
            "expires_at", Instant.ofEpochMilli(expires).toString(), "diff", expected.path("diff"),
            "destructive", false));
    }

    @PostMapping(DRAFT_ROUTE + "/resources/publish")
    @ResponseStatus(HttpStatus.ACCEPTED)
    Map<String, Object> publish(@PathVariable String draftId, @RequestBody JsonNode input,
                               @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer) {
        access.draft(bearer, draftId);
        String planId = input.path("plan_id").asText(null);
        String token = input.path("confirm_token").asText(null);
        if (planId == null || planId.isBlank() || token == null || token.isBlank()) throw PocFailure.invalid();
        PublicationStore.Plan plan = store.getPlan(planId);
        if (plan == null || plan.consumed || plan.expires <= System.currentTimeMillis()
            || !PocAccess.equal(token, confirmToken(plan))) throw PublicationStore.confirmationRequired();
        String id = store.accept(plan);
        worker.execute(() -> {
            try {
                node.execute(id, document, plan.expected);
            } catch (RuntimeException disconnected) {
                // 已领取的操作由独立回写完成，断开执行响应只能改变观察状态。
                store.failIfUnclaimed(id);
            }
        });
        return Map.of("data", Map.of("operation_id", id));
    }

    @GetMapping(DRAFT_ROUTE)
    Map<String, Object> draft(@PathVariable String draftId,
                             @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer) {
        access.draft(bearer, draftId);
        return Map.of("data", Map.of("draft_id", draftId, "recovery_action", store.recoveryAction()));
    }

    @GetMapping("/api/admin/operations/{id}")
    Map<String, Object> operation(@PathVariable String id,
                                 @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer) {
        access.admin(bearer);
        PublicationStore.Operation op = store.get(id);
        if ("running".equals(op.status)) {
            String instance = liveInstance();
            if (instance != null) op = store.observeReplacement(id, instance);
        }
        boolean terminal = "succeeded".equals(op.status) || "failed".equals(op.status);
        ObjectNode result = json.createObjectNode().put("operation_id", op.id).put("kind", "resource_publish")
            .put("status", op.status).put("progress", terminal ? 1 : 0)
            .put("created_at", op.created).put("updated_at", op.updated);
        result.putArray("log");
        if (op.publication != null) result.set("publication", op.publication);
        if (op.details != null) result.set("error_details", op.details);
        if (op.bindings != null) result.set("result", json.createObjectNode().set("bindings", op.bindings));
        return Map.of("data", result);
    }

    @PostMapping(INTERNAL_OPERATION + "/claim")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void claim(@PathVariable String id, @RequestBody JsonNode input,
               @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer) {
        access.internal(bearer);
        store.claim(id, instance(input));
    }

    @PutMapping(INTERNAL_OPERATION + "/checkpoints/{seq}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void checkpoint(@PathVariable String id, @PathVariable int seq, @RequestBody JsonNode input,
                    @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer) {
        access.internal(bearer);
        store.checkpoint(id, instance(input), seq, input.path("sdk_state_json").asText(null));
    }

    @PutMapping(INTERNAL_OPERATION + "/result")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void result(@PathVariable String id, @RequestBody JsonNode input,
                @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearer) {
        access.internal(bearer);
        store.finish(id, instance(input), input);
    }

    private String liveInstance() {
        try {
            return node.instanceId();
        } catch (WebClientException | IllegalStateException offline) {
            return null;
        }
    }

    private static String instance(JsonNode input) {
        String value = input.path("instance_id").asText("");
        if (!value.matches("[a-f0-9-]{36}")) throw PocFailure.invalid();
        return value;
    }

    private String confirmToken(PublicationStore.Plan plan) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(confirmSecret, "HmacSHA256"));
            String binding = String.join("\n", "poc-admin", "publish", PocAccess.DRAFT_ID, plan.id,
                plan.expected.path("fingerprint").asText(), Long.toString(plan.expires));
            return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(binding.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("确认令牌生成失败", error);
        }
    }

    @PreDestroy
    void close() {
        worker.shutdownNow();
    }
}
