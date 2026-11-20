package org.openagentkit.server.controller;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.catalina.connector.Connector;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.service.DraftService;
import org.openagentkit.server.service.PublicationService;
import org.openagentkit.server.support.Crypto;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.function.Supplier;

import javax.servlet.http.HttpServletRequest;

@RestController
final class SdkCallbackController {
    private final DraftService drafts;
    private final PublicationService publications;
    private final KitJson json;
    private final int port;
    private final String authorization;

    SdkCallbackController(DraftService drafts, PublicationService publications, KitConfig config, KitJson json) {
        this.drafts = drafts;
        this.publications = publications;
        this.json = json;
        this.port = (int) config.number("KIT_SDK_CALLBACK_PORT", 8792, 1, 65535);
        this.authorization = "Bearer " + config.serviceToken("KIT_SDK_CALLBACK_TOKEN");
    }

    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> loopbackCallbackPort(KitConfig config) {
        int callbackPort = (int) config.number("KIT_SDK_CALLBACK_PORT", 8792, 1, 65535);
        return factory -> {
            Connector connector = new Connector(TomcatServletWebServerFactory.DEFAULT_PROTOCOL);
            connector.setPort(callbackPort);
            connector.setProperty("address", "127.0.0.1");
            factory.addAdditionalTomcatConnectors(connector);
        };
    }

    @GetMapping("/internal/sdk/v1/drafts/{id}/document")
    ResponseEntity<?> document(HttpServletRequest request, @PathVariable String id) {
        return reply(request, () -> drafts.documentView(id));
    }

    @PostMapping("/internal/sdk/v1/drafts/{id}/document")
    ResponseEntity<?> edit(HttpServletRequest request, @PathVariable String id) {
        return reply(request, () -> drafts.edit(id, parse(request)));
    }

    @PostMapping("/internal/sdk/v1/claims/{id}/{action}")
    ResponseEntity<?> operation(HttpServletRequest request, @PathVariable String id, @PathVariable String action) {
        return reply(request, () -> {
            if (!id.matches("op_[a-f0-9-]{36}")) throw KitError.missing("Operation 不存在");
            JsonNode body = parse(request);
            switch (action) {
                case "claim": return publications.claim(id, body);
                case "grant": return publications.grant(id, body);
                case "checkpoint": return publications.checkpoint(id, body);
                default: throw KitError.missing("未知回写动作");
            }
        });
    }

    private ResponseEntity<?> reply(HttpServletRequest request, Supplier<?> body) {
        try {
            if (request.getLocalPort() != port || !"127.0.0.1".equals(request.getRemoteAddr()))
                throw KitError.missing("接口不存在");
            String token = request.getHeader("Authorization");
            if (token == null || !Crypto.equals(token, authorization))
                throw new KitError("unauthorized", 401, "内部服务认证失败");
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(KitJson.data(body.get()));
        } catch (KitError failure) {
            return ResponseEntity.status(failure.status).body(failure.body());
        } catch (RuntimeException failure) {
            return ResponseEntity.status(500).body(new KitError("internal", 500, "Kit 账本回写失败").body());
        }
    }

    private JsonNode parse(HttpServletRequest request) {
        int max = 16 * 1024 * 1024;
        if (request.getContentLengthLong() > max) throw KitController.tooLarge();
        try {
            byte[] bytes = request.getInputStream().readNBytes(max + 1);
            if (bytes.length > max) throw KitController.tooLarge();
            JsonNode data = json.mapper.readTree(bytes);
            if (data == null || !data.isObject()) throw RequestSchema.invalid();
            return data;
        } catch (IOException failure) {
            throw KitError.invalid("回写请求格式无效");
        }
    }
}
