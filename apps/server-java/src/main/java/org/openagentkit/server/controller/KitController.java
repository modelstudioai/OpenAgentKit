package org.openagentkit.server.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.service.AuthService;
import org.openagentkit.server.service.RequestContext;
import org.openagentkit.server.support.RateLimit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@RestController
final class KitController {
    private static final Logger LOG = LoggerFactory.getLogger(KitController.class);
    private static final Pattern V2 = Pattern.compile("2\\.\\d+\\.\\d+");
    private static final Pattern STREAM_ROUTES = Pattern.compile(
        "/api/(?:kit|admin/debug)/sessions/[^/]+/(?:stream|messages|tool-approvals)");
    static final String VERSION_HEADER = "x-kit-protocol-version";
    private final KitRoutes routes;
    private final RequestAuthentication access;
    private final KitJson json;
    private final KitConfig config;
    private final RateLimit limits;
    private final Metrics metrics;

    KitController(KitConfig config, KitJson json, RequestAuthentication access, Metrics metrics, List<KitRoutes.Module> modules) throws IOException {
        this.routes = new KitRoutes(json, modules);
        this.access = access;
        this.json = json;
        this.config = config;
        this.metrics = metrics;
        double rate = Double.parseDouble(config.value("KIT_RATE_LIMIT_RPS", "20"));
        if (rate < 0 || !Double.isFinite(rate)) throw new IllegalArgumentException("KIT_RATE_LIMIT_RPS 无效");
        this.limits = new RateLimit(rate, config.number("KIT_RATE_LIMIT_BURST", 60, 1, 1_000_000));
    }

    @RequestMapping({"/api/**", "/healthz", "/openapi.json", "/docs"})
    public Object serve(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String method = request.getMethod();
        String path = request.getRequestURI();
        if (path.equals("/openapi.json") && method.equals("GET")) return routes.contract;
        if (path.equals("/docs") && method.equals("GET")) {
            return ResponseEntity.ok().contentType(MediaType.TEXT_HTML)
                .body("<!doctype html><html lang=\"zh\"><title>Kit API</title><a href=\"/openapi.json\">Kit OpenAPI</a></html>");
        }
        if (path.startsWith("/api/kit/auth/")) response.setHeader("Cache-Control", "no-store");
        AuthService.Principal principal = access.resolve(request, response);
        if (STREAM_ROUTES.matcher(path).matches()) {
            String version = request.getHeader(VERSION_HEADER);
            if (version == null || !V2.matcher(version).matches()) throw KitError.conflict("Kit 协议版本不兼容，请刷新或升级客户端");
        }
        KitRoutes.Match match = routes.match(method, path);
        int status = 500;
        try {
            if (principal != null) {
                long after = limits.take(principal.subject);
                if (after > 0) {
                    response.setHeader("Retry-After", Long.toString(after));
                    metrics.rateLimited(match.route.template);
                    throw new KitError("rate_limited", 429, "请求过于频繁，请 " + after + "s 后重试", true, null);
                }
            }
            ObjectNode query = parameters(request, match);
            Object result = match.route.handler.handle(new KitRoutes.Call(request, response, new RequestContext(principal,
                readBody(request, match.route.schema.path("requestBody")), query, match.path)));
            status = result instanceof ResponseEntity ? ((ResponseEntity<?>) result).getStatusCodeValue() : response.getStatus();
            return result;
        } catch (KitError error) {
            status = error.status;
            throw error;
        } finally {
            metrics.request(match.route.template, method, status, principal);
        }
    }

    private ObjectNode parameters(HttpServletRequest request, KitRoutes.Match match) {
        ObjectNode result = json.object();
        for (JsonNode parameter : match.route.schema.path("parameters")) {
            String name = parameter.path("name").asText();
            JsonNode schema = parameter.path("schema");
            boolean path = "path".equals(parameter.path("in").asText());
            if (!path && !"query".equals(parameter.path("in").asText())) continue;
            String raw = path ? match.path.get(name) : request.getParameter(name);
            if (raw != null) {
                JsonNode value = RequestSchema.apply(RequestSchema.parseString(raw, schema), schema);
                if (!path) result.set(name, value);
            } else if (!path && schema.has("default")) {
                result.set(name, schema.get("default"));
            } else if (parameter.path("required").asBoolean()) {
                throw RequestSchema.invalid();
            }
        }
        return result;
    }

    private JsonNode readBody(HttpServletRequest request, JsonNode contract) throws IOException {
        JsonNode schema = contract.path("content").path("application/json").path("schema");
        if (schema.isMissingNode()) return json.object();
        long length = request.getContentLengthLong();
        if (length > config.bodyLimit()) throw tooLarge();
        byte[] body = request.getInputStream().readNBytes(config.bodyLimit() + 1);
        if (body.length > config.bodyLimit()) throw tooLarge();
        if (body.length == 0) {
            if (contract.path("required").asBoolean()) throw RequestSchema.invalid();
            return RequestSchema.apply(json.object(), schema);
        }
        if (request.getContentType() == null || !request.getContentType().toLowerCase(java.util.Locale.ROOT).startsWith("application/json")) {
            throw RequestSchema.invalid();
        }
        try {
            return RequestSchema.apply(json.mapper.readTree(body), schema);
        } catch (JsonProcessingException error) {
            throw RequestSchema.invalid();
        }
    }

    @ExceptionHandler(KitError.class)
    public ResponseEntity<?> handle(KitError error, HttpServletResponse response) {
        if (error.status == 429 && error.details instanceof java.util.Map) {
            Object retry = ((java.util.Map<?, ?>) error.details).get("retry_after");
            if (retry != null) response.setHeader("Retry-After", retry.toString());
        }
        return ResponseEntity.status(error.status).contentType(MediaType.APPLICATION_JSON).body(error.body());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<?> uploadTooLarge(HttpServletResponse response) {
        return handle(tooLarge(), response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> failed(Exception error, HttpServletResponse response) {
        LOG.warn("Kit 请求失败 [{}]", error.getClass().getSimpleName());
        return handle(new KitError("internal", HttpStatus.INTERNAL_SERVER_ERROR.value(), "服务端请求失败"), response);
    }

    static KitError tooLarge() {
        return KitError.bodyTooLarge();
    }
}
