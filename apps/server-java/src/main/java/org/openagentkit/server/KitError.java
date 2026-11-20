package org.openagentkit.server;

import java.util.LinkedHashMap;
import java.util.Map;

public final class KitError extends RuntimeException {
    public final String code;
    public final int status;
    public final boolean retryable;
    public final Object details;

    public KitError(String code, int status, String message, boolean retryable, Object details) {
        super(message);
        this.code = code;
        this.status = status;
        this.retryable = retryable;
        this.details = details;
    }

    public KitError(String code, int status, String message) {
        this(code, status, message, false, null);
    }

    public static KitError invalid(String message) {
        return new KitError("invalid_request", 400, message);
    }

    public static KitError unauthorized() {
        return new KitError("unauthorized", 401, "登录状态无效或已过期，请重新登录");
    }

    public static KitError missing(String message) {
        return new KitError("not_found", 404, message);
    }

    public static KitError conflict(String message) {
        return new KitError("conflict", 409, message);
    }

    public static KitError provider(String message) {
        return new KitError("provider_error", 502, message, true, null);
    }

    public Map<String, Object> body() {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", code);
        error.put("message", getMessage());
        error.put("retryable", retryable);
        if (details != null) error.put("details", details);
        return Map.of("error", error);
    }

    public static KitError invalidRequest() {
        return invalid("请求参数无效");
    }

    public static KitError bodyTooLarge() {
        return new KitError("invalid_request", 413, "请求体超过上限");
    }
}
