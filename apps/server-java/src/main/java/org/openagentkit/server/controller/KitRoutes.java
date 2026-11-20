package org.openagentkit.server.controller;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.service.RequestContext;
import org.springframework.http.server.PathContainer;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

final class KitRoutes {
    public interface Module {
        void register(KitRoutes routes);
    }

    @FunctionalInterface
    public interface Handler {
        Object handle(Call call) throws IOException;
    }

    private final List<Route> routes = new ArrayList<>();
    private final Set<String> keys = new HashSet<>();
    final JsonNode contract;

    KitRoutes(KitJson json, List<Module> modules) throws IOException {
        try (InputStream input = KitRoutes.class.getResourceAsStream("/kit/openapi.json")) {
            this.contract = json.mapper.readTree(input);
        }
        for (Module module : modules) module.register(this);
        Set<String> missing = new java.util.TreeSet<>();
        contract.path("paths").fields().forEachRemaining(entry -> entry.getValue().fieldNames().forEachRemaining(method -> {
            if (Set.of("get", "post", "put", "patch", "delete", "head", "options", "trace").contains(method)) {
                String operation = method.toUpperCase(java.util.Locale.ROOT) + " " + entry.getKey();
                if (!keys.contains(operation)) missing.add(operation);
            }
        }));
        if (!missing.isEmpty()) throw new IllegalStateException("Spring Boot 缺少 Kit OpenAPI 路由 " + missing);
        routes.sort(Comparator.comparing(route -> route.path, PathPattern.SPECIFICITY_COMPARATOR));
    }

    public void add(String method, String path, Handler handler) {
        JsonNode schema = contract.path("paths").path(path).path(method.toLowerCase(java.util.Locale.ROOT));
        if (schema.isMissingNode()) throw new IllegalArgumentException("Kit OpenAPI 缺少 " + method + " " + path);
        if (!keys.add(method + " " + path)) throw new IllegalArgumentException("Kit 路由重复 " + method + " " + path);
        routes.add(new Route(method, path, handler, schema));
    }

    Match match(String method, String path) {
        PathContainer input = PathContainer.parsePath(path);
        for (Route route : routes) {
            if (!(route.method.equals(method) || ("HEAD".equals(method) && "GET".equals(route.method)))) continue;
            PathPattern.PathMatchInfo match = route.path.matchAndExtract(input);
            if (match != null) return new Match(route, match.getUriVariables());
        }
        throw KitError.missing("接口不存在");
    }

    static final class Route {
        final String method;
        final String template;
        final PathPattern path;
        final Handler handler;
        final JsonNode schema;

        Route(String method, String template, Handler handler, JsonNode schema) {
            this.method = method;
            this.template = template;
            this.path = new PathPatternParser().parse(template);
            this.handler = handler;
            this.schema = schema;
        }
    }

    static final class Match {
        final Route route;
        final Map<String, String> path;

        Match(Route route, Map<String, String> path) {
            this.route = route;
            this.path = path;
        }
    }

    static final class Call {
        final HttpServletRequest request;
        final HttpServletResponse response;
        final RequestContext input;

        Call(HttpServletRequest request, HttpServletResponse response, RequestContext input) {
            this.request = request;
            this.response = response;
            this.input = input;
        }
    }
}
