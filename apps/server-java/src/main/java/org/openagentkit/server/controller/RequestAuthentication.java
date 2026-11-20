package org.openagentkit.server.controller;

import org.openagentkit.server.service.AuthService;
import org.springframework.stereotype.Component;

import java.util.Set;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@Component
final class RequestAuthentication {
    private static final Set<String> NO_AUTH = Set.of("/healthz", "/api/config", "/api/branding/logo",
        "/openapi.json", "/docs", "/api/kit/auth/login", "/api/kit/auth/logout");
    private static final Set<String> READ_ONLY = Set.of("GET", "HEAD", "OPTIONS");
    private final AuthService auth;

    RequestAuthentication(AuthService auth) {
        this.auth = auth;
    }

    AuthService.Principal resolve(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getRequestURI();
        if (NO_AUTH.contains(path)) return null;
        String authorization = request.getHeader("Authorization");
        if (path.startsWith("/api/admin")) return auth.admin(authorization, READ_ONLY.contains(request.getMethod()));
        if (authorization != null && !authorization.isEmpty()) return auth.authenticate(authorization);

        String subject = null;
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (cookie.getName().equals("kit_subject")) subject = cookie.getValue();
            }
        }
        return auth.anonymous(subject, value -> response.addHeader("Set-Cookie",
            "kit_subject=" + value + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000"));
    }
}
