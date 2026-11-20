package org.openagentkit.server;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Component
public final class KitConfig {
    private final Environment environment;

    public KitConfig(Environment environment) {
        this.environment = environment;
    }

    public String value(String key, String fallback) {
        String value = environment.getProperty(key, "").trim();
        return value.isEmpty() ? fallback : value;
    }

    public long number(String key, long fallback, long minimum, long maximum) {
        String value = value(key, Long.toString(fallback));
        try {
            long number = Long.parseLong(value);
            if (number >= minimum && number <= maximum) return number;
        } catch (NumberFormatException ignored) {
            // 配置错误不带入原始值，避免把密码等输入写入日志。
        }
        throw new IllegalArgumentException(key + " 配置无效");
    }

    public List<String> list(String key) {
        return Arrays.stream(value(key, "").split(",")).map(String::trim)
            .filter(entry -> !entry.isEmpty()).collect(Collectors.toList());
    }

    public Path dataDir() {
        return Path.of(value("KIT_DATA_DIR", ".data")).toAbsolutePath().normalize();
    }

    public URI sdkAddress() {
        URI address;
        try {
            address = URI.create(value("KIT_SDK_URL", "http://127.0.0.1:8791"));
        } catch (IllegalArgumentException ignored) {
            throw new IllegalArgumentException("KIT_SDK_URL 配置无效");
        }
        if (!"http".equals(address.getScheme()) || !"127.0.0.1".equals(address.getHost())
            || address.getUserInfo() != null || address.getPort() < 1 || address.getQuery() != null
            || address.getFragment() != null || !(address.getPath().isEmpty() || address.getPath().equals("/"))) {
            throw new IllegalArgumentException("KIT_SDK_URL 必须为带端口的 IPv4 回环 HTTP 地址");
        }
        return address;
    }

    public String serviceToken(String key) {
        String token = value(key, "");
        if (!token.matches("[A-Za-z0-9_-]{32,256}")) throw new IllegalArgumentException(key + " 必须配置专用服务令牌");
        return token;
    }

    public int bodyLimit() {
        return (int) number("KIT_BODY_LIMIT_BYTES", 1048576, 1, Integer.MAX_VALUE - 1);
    }

    public int uploadLimit() {
        return (int) number("KIT_UPLOAD_MAX_BYTES", 20971520, 1, (Integer.MAX_VALUE - 4096) / 2);
    }
}
