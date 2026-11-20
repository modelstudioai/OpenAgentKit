package org.openagentkit.server.controller;

import org.openagentkit.server.KitConfig;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
final class KitCors extends OncePerRequestFilter {
    private static final Pattern LOOPBACK = Pattern.compile("https?://(?:127\\.0\\.0\\.1|localhost|\\[::1\\]):[0-9]{1,5}");
    private final List<String> origins;

    KitCors(KitConfig config) {
        List<String> configured = config.list("KIT_CORS_ORIGINS");
        this.origins = configured.isEmpty()
            ? List.of("http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:*") : configured;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws IOException, ServletException {
        String origin = request.getHeader("Origin");
        if (origin != null) {
            response.addHeader("Vary", "Origin");
            if (allowed(origin)) setHeaders(response, origin);
        }
        if ("OPTIONS".equals(request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_NO_CONTENT);
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean allowed(String origin) {
        if (origins.contains(origin) && !origin.contains("*")) return true;
        return LOOPBACK.matcher(origin).matches() && origins.contains(origin.substring(0, origin.lastIndexOf(':') + 1) + "*");
    }

    private static void setHeaders(HttpServletResponse response, String origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Access-Control-Allow-Credentials", "true");
        response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Kit-Protocol-Version,X-Kit-Draft-Key");
        response.setHeader("Access-Control-Expose-Headers", "Content-Disposition,Retry-After");
    }
}
