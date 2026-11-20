package org.openagentkit.server.controller;

import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.service.AuthService;
import org.openagentkit.server.service.FileDownload;
import org.openagentkit.server.service.MetaService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
final class MetaController implements KitRoutes.Module {
    private final MetaService meta;
    private final AuthService auth;
    private final Metrics metrics;

    MetaController(MetaService meta, AuthService auth, Metrics metrics) {
        this.meta = meta;
        this.auth = auth;
        this.metrics = metrics;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", "/healthz", call -> {
            String mode = meta.gatewayMode();
            return mode == null ? ResponseEntity.status(503).body(Map.of("ok", false)) : Map.of("ok", true, "gateway", mode);
        });
        routes.add("GET", "/api/config", call -> meta.publicConfig());
        routes.add("POST", "/api/kit/auth/login", call -> KitJson.data(auth.login(call.input.body)));
        routes.add("POST", "/api/kit/auth/logout", call -> {
            auth.logout(call.request.getHeader("Authorization"));
            return ResponseEntity.noContent().build();
        });
        routes.add("GET", "/api/kit/auth/me", call -> {
            if (call.request.getHeader("Authorization") == null) throw new KitError("unauthorized", 401, "请先登录");
            return KitJson.data(call.input.identity.view());
        });
        routes.add("GET", "/api/admin/identity", call -> KitJson.data(Map.of("subject", call.input.subject(), "role", call.input.identity.role)));
        routes.add("GET", "/api/admin/metrics", call -> ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(metrics.text()));
        routes.add("GET", "/api/admin/audit", call -> {
            call.response.setHeader("Cache-Control", "no-store");
            return meta.auditPage(call.input);
        });
        routes.add("GET", "/api/admin/branding", call -> KitJson.data(meta.branding(true)));
        routes.add("PUT", "/api/admin/branding", call -> meta.updateBranding(call.input));
        routes.add("POST", "/api/admin/branding/logo", call -> ResponseEntity.status(201).body(meta.uploadLogo(call.input, Uploads.single(call.request))));
        routes.add("GET", "/api/branding/logo", call -> logo());
    }

    private ResponseEntity<byte[]> logo() {
        FileDownload file = meta.logo();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.contentType))
            .header("Content-Security-Policy",
                "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            .header("X-Content-Type-Options", "nosniff").header("Cache-Control", "public, max-age=31536000, immutable")
            .body(file.bytes);
    }
}
