package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.springframework.stereotype.Service;

@Service
public final class RemoteService {
    private final GatewayClient gateway;

    RemoteService(GatewayClient gateway) {
        this.gateway = gateway;
    }

    public Object get(String method, Object... args) {
        JsonNode value = gateway.call(method, args);
        if (value.isNull()) throw KitError.missing("远端资源不存在或已不可用");
        return KitJson.data(value);
    }

    public Object list(String method, Object... args) {
        return KitJson.data(gateway.call(method, args));
    }

    public Object agentVersion(String agent, String rawVersion) {
        long version;
        try {
            version = new java.math.BigDecimal(rawVersion).longValueExact();
        } catch (ArithmeticException | NumberFormatException error) {
            throw KitError.invalidRequest();
        }
        return get("getRemoteAgentVersionDetail", agent, version);
    }
}
