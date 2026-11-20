package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.KitTransactions;
import org.openagentkit.server.dao.MemberDao;
import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.support.Crypto;
import org.openagentkit.server.support.RateLimit;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;

@Service
public final class AuthService {
    private static final String MEMBER_TOKEN = "kit_member_[A-Za-z0-9_-]{43}";
    private final MemberDao dao;
    private final KitTransactions transactions;
    private final KitJson json;
    private final Map<String, String> adminTokens = new LinkedHashMap<>();
    private final String jwtSecret;
    final String authMode;
    private final RateLimit accounts = new RateLimit(1.0 / 60, 10);
    private final RateLimit global = new RateLimit(5, 50);
    private final Semaphore passwordWork = new Semaphore(4);
    private final Map<String, Set<Runnable>> revocations = new java.util.concurrent.ConcurrentHashMap<>();

    AuthService(MemberDao dao, KitTransactions transactions, KitJson json, KitConfig config) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        this.authMode = config.value("KIT_AUTH_MODE", "member");
        this.jwtSecret = config.value("KIT_JWT_SECRET", "");
        if (!Set.of("member", "anonymous").contains(authMode)) throw new IllegalArgumentException("KIT_AUTH_MODE 无效");
        String primary = config.value("ADMIN_TOKEN", "");
        if (!primary.isEmpty()) adminTokens.put(primary, "admin");
        for (String entry : config.list("KIT_ADMIN_TOKENS")) {
            int separator = entry.lastIndexOf(':');
            String token = (separator > 0 ? entry.substring(0, separator) : entry).trim();
            String role = separator > 0 ? entry.substring(separator + 1).trim() : "admin";
            if (!Set.of("admin", "auditor").contains(role)) throw new IllegalArgumentException("KIT_ADMIN_TOKENS 角色无效");
            adminTokens.putIfAbsent(token, role);
        }
    }

    public Principal admin(String authorization, boolean readOnly) {
        String token = bearer(authorization);
        if (adminTokens.isEmpty()) throw new KitError("unauthorized", 401, "服务端未配置 ADMIN_TOKEN / KIT_ADMIN_TOKENS");
        if (token == null) throw new KitError("unauthorized", 401, "缺少管理端令牌");
        for (Map.Entry<String, String> entry : adminTokens.entrySet()) {
            if (!Crypto.equals(token, entry.getKey())) continue;
            String role = entry.getValue();
            if (role.equals("auditor") && !readOnly) {
                throw new KitError("forbidden", 403, "auditor 是只读角色，不能执行写操作");
            }
            return new Principal("admin:" + role + ":" + Crypto.digest(token).substring(0, 8), null, role, role,
                null, null, null);
        }
        throw new KitError("forbidden", 403, "管理端令牌无效");
    }

    private Principal jwt(String jwt) {
        try {
            String[] parts = jwt.split("\\.", -1);
            if (parts.length != 3 || !Crypto.equals(Crypto.base64(Crypto.hmac(jwtSecret, parts[0] + "." + parts[1])), parts[2])) {
                throw KitError.unauthorized();
            }
            JsonNode header = json.stored(Crypto.decode(parts[0]));
            JsonNode payload = json.stored(Crypto.decode(parts[1]));
            String subject = payload.path("sub").asText("");
            if (!"HS256".equals(header.path("alg").asText()) || !payload.path("sub").isTextual()
                || subject.isEmpty() || subject.startsWith("member_")) throw KitError.unauthorized();
            Instant expires = null;
            if (payload.has("exp")) {
                if (!payload.get("exp").isNumber()) throw KitError.unauthorized();
                expires = Instant.ofEpochMilli((long) (payload.path("exp").asDouble() * 1000));
                if (!expires.isAfter(Instant.now())) throw KitError.unauthorized();
            }
            return new Principal(subject, text(payload, "name"), text(payload, "tier"), null, expires, null, null);
        } catch (RuntimeException error) {
            throw KitError.unauthorized();
        }
    }

    private static String text(JsonNode input, String name) {
        return input.path(name).isTextual() ? input.path(name).asText() : null;
    }

    void assertActive(Principal principal) {
        if (principal.expires != null && !principal.expires.isAfter(Instant.now())) throw KitError.unauthorized();
        if (principal.tokenHash != null) member(principal.tokenHash, true);
    }

    private Principal member(String hash, boolean valid) {
        if (!valid) throw KitError.unauthorized();
        Row session = dao.findLoginSession(hash);
        if (session == null || !Instant.parse(session.text("expires_at")).isAfter(Instant.now())) throw KitError.unauthorized();
        Row row = dao.findMember(session.text("member_id"));
        if (row == null || !"active".equals(row.text("status"))) throw KitError.unauthorized();
        return new Principal(row.text("member_id"), row.text("display_name"), "member", null,
            Instant.parse(session.text("expires_at")), hash, memberView(row));
    }

    public Object login(JsonNode request) {
        String username = request.path("username").asText().trim().toLowerCase(java.util.Locale.ROOT);
        String password = request.path("password").asText();
        long retry = Math.max(global.take("login"), accounts.take(Crypto.digest(username)));
        if (retry > 0) throw loginLimited(retry);
        if (!passwordWork.tryAcquire()) throw loginLimited(1);
        Row member;
        try {
            member = dao.findByUsernameWithPassword(username);
            if (!Crypto.passwordMatches(password, member == null ? null : member.text("password_hash"))
                || member == null || !"active".equals(member.text("status"))) {
                throw new KitError("unauthorized", 401, "用户名或密码错误");
            }
        } finally {
            passwordWork.release();
        }
        String token = "kit_member_" + Crypto.token(32);
        Instant now = Instant.now();
        String expires = KitJson.iso(now.plus(8, ChronoUnit.HOURS));
        transactions.run(() -> {
            dao.deleteExpiredLoginSessions(KitJson.iso(now));
            dao.insertLoginSession(Crypto.digest(token), member.text("member_id"), KitJson.iso(now), expires);
            return null;
        });
        return KitJson.fields("access_token", token, "token_type", "Bearer", "expires_at", expires, "member", memberView(member));
    }

    private static KitError loginLimited(long after) {
        return new KitError("rate_limited", 429, "登录尝试过于频繁，请稍后重试", true, Map.of("retry_after", after));
    }

    public void logout(String header) {
        String token = bearer(header);
        if (token == null || !token.matches(MEMBER_TOKEN)) return;
        String hash = Crypto.digest(token);
        dao.deleteLoginSession(hash);
        Set<Runnable> subscribers = revocations.remove(hash);
        if (subscribers != null) subscribers.forEach(Runnable::run);
    }

    Runnable watch(Principal principal, Runnable revoked) {
        if (principal.tokenHash == null) {
            assertActive(principal);
            return () -> {};
        }
        String hash = principal.tokenHash;
        revocations.compute(hash, (key, listeners) -> {
            Set<Runnable> next = listeners == null ? java.util.concurrent.ConcurrentHashMap.newKeySet() : listeners;
            next.add(revoked);
            return next;
        });
        Runnable remove = () -> revocations.computeIfPresent(hash, (key, listeners) -> {
            listeners.remove(revoked);
            return listeners.isEmpty() ? null : listeners;
        });
        try {
            assertActive(principal);
        } catch (RuntimeException error) {
            remove.run();
            throw error;
        }
        return remove;
    }

    static String bearer(String value) {
        return value != null && value.startsWith("Bearer ") ? value.substring(7) : null;
    }

    static Map<String, Object> memberView(Row row) {
        Map<String, Object> result = new LinkedHashMap<>(row);
        result.remove("password_hash");
        if (row.get("email") == null || "".equals(row.text("email"))) result.remove("email");
        return result;
    }

    public static final class Principal {
        public final String subject;
        final String name;
        final String tier;
        public final String role;
        final Instant expires;
        final String tokenHash;
        final Map<String, Object> member;

        Principal(String subject, String name, String tier, String role, Instant expires, String tokenHash,
                  Map<String, Object> member) {
            this.subject = subject;
            this.name = name;
            this.tier = tier;
            this.role = role;
            this.expires = expires;
            this.tokenHash = tokenHash;
            this.member = member;
        }

        public Map<String, Object> view() {
            Map<String, Object> identity = KitJson.fields("subjectId", subject);
            if (name != null) identity.put("displayName", name);
            if (tier != null) identity.put("tier", tier);
            Map<String, Object> view = KitJson.fields("identity", identity);
            if (expires != null) view.put("expires_at", KitJson.iso(expires));
            if (member != null) view.put("member", member);
            return view;
        }
    }

    public String authMode() {
        return authMode;
    }

    public Principal authenticate(String authorization) {
        String token = bearer(authorization);
        if (token == null) throw KitError.unauthorized();
        if (token.startsWith("kit_member_")) return member(Crypto.digest(token), token.matches(MEMBER_TOKEN));
        if (!jwtSecret.isEmpty()) return jwt(token);
        throw KitError.unauthorized();
    }

    public Principal anonymous(String subject, java.util.function.Consumer<String> newSubject) {
        if (!authMode.equals("anonymous")) throw new KitError("unauthorized", 401, "请先登录");
        if (subject == null || subject.isEmpty() || subject.length() > 256 || subject.startsWith("member_")
            || subject.startsWith("kit_member_") || subject.startsWith("admin:")) {
            subject = "anon_" + Crypto.token(9);
            newSubject.accept(subject);
        }
        return new Principal(subject, "访客", "anonymous", null, null, null, null);
    }
}
