package org.openagentkit.server.controller;

import org.openagentkit.server.service.AuthService;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

@Component
final class Metrics {
    private final Map<String, LongAdder> counters = new ConcurrentHashMap<>();

    void request(String route, String method, int status, AuthService.Principal identity) {
        count("kit_http_requests_total{route=\"" + route + "\",method=\"" + method + "\",status=\"" + status + "\"}");
        if (identity != null && identity.role != null && !java.util.Set.of("GET", "HEAD", "OPTIONS").contains(method)) {
            count("kit_admin_writes_total{role=\"" + identity.role + "\",status=\"" + status + "\"}");
        }
    }

    void rateLimited(String route) {
        count("kit_rate_limited_total{route=\"" + route + "\"}");
    }

    private void count(String key) {
        counters.computeIfAbsent(key, ignored -> new LongAdder()).increment();
    }

    String text() {
        StringBuilder result = new StringBuilder();
        counters.keySet().stream().sorted().forEach(key -> result.append(key).append(' ').append(counters.get(key).sum()).append('\n'));
        return result.toString();
    }
}
