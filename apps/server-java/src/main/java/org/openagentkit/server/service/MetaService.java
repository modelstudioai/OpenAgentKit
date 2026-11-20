package org.openagentkit.server.service;

import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.MetaDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.support.Crypto;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public final class MetaService implements ApplicationRunner {
    private static final String LOGO = "/api/branding/logo";
    private static final Set<String> TYPES = Set.of("image/png", "image/jpeg", "image/webp", "image/svg+xml");
    private static final List<String> AUDIT_ACTIONS = List.of("templates.create", "templates.update", "templates.delete",
        "templates.listing", "catalog.create", "catalog.update", "catalog.delete", "catalog.list", "catalog.unlist",
        "branding.update");
    private final MetaDao dao;
    private final KitTransactions transactions;
    private final KitConfig config;
    private final KitJson json;
    private final GatewayClient gateway;
    private final AuthService access;
    private volatile String mode;

    MetaService(MetaDao dao, KitTransactions transactions, KitConfig config, KitJson json, GatewayClient gateway, AuthService access) {
        this.dao = dao;
        this.transactions = transactions;
        this.config = config;
        this.json = json;
        this.gateway = gateway;
        this.access = access;
    }

    @Override
    public void run(ApplicationArguments ignored) {
        mode = gateway.health().path("mode").asText();
        if (!Set.of("sdk", "mock").contains(mode)) throw KitError.provider("Node SDK 网关模式无效");
        String defaultQuota = config.value("KIT_QUOTA_DEFAULT_MONTHLY", "");
        if (!defaultQuota.isEmpty()) {
            long cap = config.number("KIT_QUOTA_DEFAULT_MONTHLY", 200, -1, Long.MAX_VALUE);
            dao.initializeDefaultQuota(cap, KitJson.now(), cap);
        }
    }

    public Object publicConfig() {
        return KitJson.data(KitJson.fields("apiBaseUrl", config.value("KIT_PUBLIC_BASE_URL", "").replaceAll("/+$", ""),
            "protocolVersion", "2.0.0", "gateway", mode, "auth", Map.of("mode", access.authMode, "passwordLogin", true),
            "capabilities", Map.of("streaming", true, "fileUpload", true, "artifacts", true, "threads", true),
            "branding", branding(false)));
    }

    public Object auditPage(RequestContext call) {
        String subject = call.subject();
        long total = dao.countAudit(subject, AUDIT_ACTIONS);
        return KitJson.fields("data", dao.listAudit(subject, AUDIT_ACTIONS, call.query.path("limit").asInt(100),
            call.query.path("offset").asInt(0)), "total", total);
    }

    void audit(String subject, String action, String target, Object detail) {
        if (!AUDIT_ACTIONS.contains(action)) return;
        dao.appendAudit(KitJson.now(), subject, action, target, detail == null ? null : json.write(detail));
    }

    public Map<String, Object> branding(boolean admin) {
        Row row = dao.findBranding();
        if (row == null) {
            dao.createDefaultBranding("OpenAgentKit", KitJson.now());
            row = dao.findBranding();
        }
        Row logo = dao.findLogoHash();
        String url = logo == null ? row.text("logo_url") : LOGO + "?v=" + logo.text("hash");
        Map<String, Object> view = KitJson.fields("productName", row.text("product_name"));
        if (url != null && !url.isEmpty()) view.put("logoUrl", url);
        if (admin) {
            view.put("updatedAt", row.text("updated_at"));
            if (row.text("updated_by") != null) view.put("updatedBy", row.text("updated_by"));
        }
        return view;
    }

    public Object updateBranding(RequestContext call) {
        String name = call.value("productName").trim();
        if (name.isEmpty()) throw KitError.invalidRequest();
        String supplied = call.value("logoUrl");
        String url = supplied == null ? null : supplied.strip();
        if (url != null && !(url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\"))) {
            try {
                URI value = URI.create(url);
                if (!("http".equalsIgnoreCase(value.getScheme()) || "https".equalsIgnoreCase(value.getScheme())) || value.getHost() == null
                    || value.getRawUserInfo() != null) throw KitError.invalidRequest();
            } catch (IllegalArgumentException error) {
                throw KitError.invalidRequest();
            }
        }
        return transactions.run(() -> {
            branding(true);
            Row logo = dao.findLogoHash();
            if (!call.body.has("logoUrl") || logo != null && url != null && url.endsWith(LOGO + "?v=" + logo.text("hash"))) {
                dao.updateProductName(name, KitJson.now(), call.subject());
            } else {
                dao.deleteLogo();
                dao.updateBranding(name, url, KitJson.now(), call.subject());
            }
            audit(call.subject(), "branding.update", "employee-web", Map.of("productName", name, "logoUrlChanged", call.body.has("logoUrl")));
            return KitJson.data(branding(true));
        });
    }

    public Object uploadLogo(RequestContext call, FileUpload file) throws IOException {
        if (file.size > 512 * 1024) throw new KitError("invalid_request", 413, "Logo 不能超过 512KB");
        String type = file.contentType;
        if (type == null || !TYPES.contains(type)) throw KitError.invalid("Logo 仅支持 PNG、JPEG、WebP 或 SVG");
        byte[] bytes = file.bytes();
        String hash = Crypto.digest(bytes).substring(0, 16);
        return transactions.run(() -> {
            branding(true);
            String now = KitJson.now();
            dao.saveLogo(type, bytes, hash, now);
            dao.clearExternalLogoUrl(now, call.subject());
            audit(call.subject(), "branding.update", "employee-web", Map.of("logoUploaded", true, "contentType", type, "bytes", file.size));
            return KitJson.data(branding(true));
        });
    }

    public FileDownload logo() {
        Row logo = dao.findLogo();
        if (logo == null) throw KitError.missing("Logo 不存在");
        return new FileDownload(null, logo.text("content_type"), logo.bytes("bytes"));
    }

    public String gatewayMode() {
        return mode;
    }
}
