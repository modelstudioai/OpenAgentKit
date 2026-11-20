package poc;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.net.URI;
import java.time.Duration;
import java.util.Map;

@Component
final class NodeClient {
    private static final String SESSION = "/internal/poc/sessions/" + PocAccess.SESSION_ID;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final ParameterizedTypeReference<ServerSentEvent<JsonNode>> EVENT_TYPE =
        new ParameterizedTypeReference<ServerSentEvent<JsonNode>>() {};
    private final WebClient client;

    NodeClient(WebClient.Builder builder, Environment environment) {
        URI base = URI.create(environment.getRequiredProperty("POC_NODE_BASE_URL"));
        if (!"http".equals(base.getScheme()) || !"127.0.0.1".equals(base.getHost()) || base.getUserInfo() != null)
            throw new IllegalArgumentException("PoC Node 仅支持回环地址");
        client = builder.baseUrl(base.toString())
            .clientConnector(new ReactorClientHttpConnector(HttpClient.create().disableRetry(true)))
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + environment.getRequiredProperty("POC_INTERNAL_TOKEN"))
            .build();
    }

    Flux<ServerSentEvent<JsonNode>> stream() {
        return client.get().uri(SESSION + "/stream")
            .accept(MediaType.TEXT_EVENT_STREAM).retrieve().bodyToFlux(EVENT_TYPE);
    }

    Mono<JsonNode> history(String pageToken) {
        return client.get().uri(builder -> {
            builder.path(SESSION + "/events");
            if (pageToken != null) builder.queryParam("page_token", "{token}");
            return pageToken == null ? builder.build() : builder.build(pageToken);
        }).retrieve().bodyToMono(JsonNode.class).timeout(REQUEST_TIMEOUT);
    }

    JsonNode send(String text) {
        return post(SESSION + "/messages", Map.of("text", text)).block(REQUEST_TIMEOUT);
    }

    JsonNode plan(JsonNode document) {
        return post("/internal/poc/drafts/" + PocAccess.DRAFT_ID + "/plan", document).block(REQUEST_TIMEOUT);
    }

    void execute(String operationId, JsonNode document, JsonNode confirmed) {
        post("/internal/poc/operations/" + operationId + "/execute", Map.of("document", document, "expected", confirmed))
            .block(Duration.ofSeconds(40));
    }

    String instanceId() {
        JsonNode health = client.get().uri("/internal/poc/health")
            .retrieve().bodyToMono(JsonNode.class).block(Duration.ofSeconds(1));
        return health == null ? "" : health.path("instance_id").asText();
    }

    private Mono<JsonNode> post(String path, Object body) {
        return client.post().uri(path).contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body).retrieve().bodyToMono(JsonNode.class);
    }
}
