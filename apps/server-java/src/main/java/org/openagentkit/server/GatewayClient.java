package org.openagentkit.server;

import com.fasterxml.jackson.databind.JsonNode;
import io.netty.channel.ChannelOption;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;

@Component
public final class GatewayClient {
    private static final String PREFIX = "/internal/sdk/v1";
    private static final Duration RPC_TIMEOUT = Duration.ofSeconds(60);
    private final WebClient http;

    public GatewayClient(KitConfig config) {
        HttpClient client = HttpClient.create().disableRetry(true)
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3000);
        this.http = WebClient.builder().baseUrl(config.sdkAddress().toString())
            .clientConnector(new ReactorClientHttpConnector(client))
            .defaultHeaders(headers -> headers.setBearerAuth(config.serviceToken("KIT_SDK_GATEWAY_TOKEN")))
            .codecs(codecs -> codecs.defaultCodecs().maxInMemorySize(Math.max(config.uploadLimit(), config.bodyLimit())))
            .build();
    }

    public JsonNode health() {
        JsonNode data = await(http.get().uri(PREFIX + "/health").exchangeToMono(this::json));
        if (data.path("version").asInt() != 1 || !data.path("instance_id").isTextual()) {
            throw KitError.provider("Node SDK 网关版本不兼容");
        }
        return data;
    }

    public JsonNode call(String method, Object... args) {
        return request(method, Arrays.asList(args));
    }

    public JsonNode upload(String name, String type, byte[] bytes) {
        return request("uploadFile", Map.of("filename", name, "mimeType", type,
            "bytes", Base64.getEncoder().encodeToString(bytes)));
    }

    public Download download(String fileId) {
        ResponseEntity<byte[]> response = await(http.post().uri(PREFIX + "/rpc/downloadFile")
            .contentType(MediaType.APPLICATION_JSON).bodyValue(java.util.List.of(fileId))
            .exchangeToMono(result -> result.statusCode().isError()
                ? failure(result) : result.toEntity(byte[].class)));
        return new Download(response.getHeaders().getFirst("x-kit-filename"),
            response.getHeaders().getFirst("x-kit-content-type"), response.getBody());
    }

    public static final class Download {
        public final String encodedFilename;
        public final String contentType;
        public final byte[] bytes;

        private Download(String encodedFilename, String contentType, byte[] bytes) {
            this.encodedFilename = encodedFilename;
            this.contentType = contentType;
            this.bytes = bytes;
        }
    }

    private JsonNode request(String method, Object body) {
        return await(http.post().uri(PREFIX + "/rpc/{method}", method)
            .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchangeToMono(this::json));
    }

    public Flux<ServerSentEvent<String>> stream(String sessionId) {
        return http.get().uri(PREFIX + "/sessions/{sessionId}/stream", sessionId)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .exchangeToFlux(response -> response.statusCode().isError()
                ? this.<ServerSentEvent<String>>failure(response).flux()
                : response.bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<String>>() {}));
    }

    private Mono<JsonNode> json(ClientResponse response) {
        if (response.statusCode().isError()) return failure(response);
        return response.bodyToMono(JsonNode.class).map(body -> body.path("data"));
    }

    private <T> Mono<T> failure(ClientResponse response) {
        return response.bodyToMono(JsonNode.class).flatMap(body -> {
            JsonNode error = body.path("error");
            return Mono.<T>error(new KitError(error.path("code").asText("provider_error"), response.rawStatusCode(),
                error.path("message").asText("Node SDK 请求失败"), error.path("retryable").asBoolean(),
                error.has("details") ? error.get("details") : null));
        }).switchIfEmpty(Mono.error(KitError.provider("Node SDK 请求失败")));
    }

    private static <T> T await(Mono<T> response) {
        try {
            T result = response.block(RPC_TIMEOUT);
            if (result == null) throw KitError.provider("Node SDK 响应为空");
            return result;
        } catch (KitError error) {
            throw error;
        } catch (RuntimeException error) {
            throw KitError.provider("Node SDK 连接不可用或已超时");
        }
    }
}
