package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.dao.ConfirmationDao;
import org.openagentkit.server.support.Crypto;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
final class Confirmations {
    private final String secret;
    private final ConfirmationDao dao;
    private final KitJson json;

    Confirmations(KitConfig config, ConfirmationDao dao, KitJson json) {
        this.secret = config.value("KIT_CONFIRM_SECRET", Crypto.token(32));
        this.dao = dao;
        this.json = json;
    }

    String id(String kind, String target) {
        return kind + "_" + target + "_" + UUID.randomUUID().toString().substring(0, 8);
    }

    Map<String, Object> plan(String id, String action, String subject, Object diff, boolean destructive) {
        long expires = Instant.now().plusSeconds(300).toEpochMilli();
        String message = Crypto.base64(json.write(KitJson.fields("planId", id, "action", action,
            "subject", subject, "expiresAt", expires)));
        return KitJson.fields("plan_id", id, "confirm_token", message + "." + Crypto.base64(Crypto.hmac(secret, message)),
            "destructive", destructive, "expires_at", KitJson.iso(Instant.ofEpochMilli(expires)), "diff", diff);
    }

    void consume(RequestContext call, String action, String requiredPrefix) {
        consume(call.value("plan_id"), call.value("confirm_token"), action, call.subject(), requiredPrefix);
    }

    void consume(String id, String token, String action, String subject, String requiredPrefix) {
        if (id == null || id.isEmpty() || token == null || token.isEmpty()) throw KitError.invalidRequest();
        if (!id.startsWith(requiredPrefix)) throw rejected();
        long expires = verify(id, token, action, subject);
        dao.deleteExpired(KitJson.now());
        try {
            dao.insertConsumption(Crypto.digest(json.write(java.util.List.of(id, action, subject))),
                    KitJson.iso(Instant.ofEpochMilli(expires)));
        } catch (DuplicateKeyException error) {
            throw rejected();
        }
    }

    private long verify(String id, String token, String action, String subject) {
        try {
            int separator = token.lastIndexOf('.');
            if (separator <= 0) throw rejected();
            String message = token.substring(0, separator);
            if (!MessageDigest.isEqual(Crypto.hmac(secret, message), Crypto.unbase64(token.substring(separator + 1)))) {
                throw rejected();
            }
            JsonNode body = json.stored(Crypto.decode(message));
            long expires = body.path("expiresAt").asLong();
            if (expires < System.currentTimeMillis() || !id.equals(body.path("planId").asText())
                || !action.equals(body.path("action").asText()) || !subject.equals(body.path("subject").asText())) {
                throw rejected();
            }
            return expires;
        } catch (RuntimeException error) {
            throw rejected();
        }
    }

    private static KitError rejected() {
        return new KitError("confirmation_required", 428, "确认令牌无效、已过期或已使用，请重新获取计划");
    }
}
