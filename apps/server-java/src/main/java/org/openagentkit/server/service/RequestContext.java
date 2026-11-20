package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;

public final class RequestContext {
    public final AuthService.Principal identity;
    public final JsonNode body;
    public final ObjectNode query;
    private final Map<String, String> path;

    public RequestContext(AuthService.Principal identity, JsonNode body, ObjectNode query, Map<String, String> path) {
        this.identity = identity;
        this.body = body;
        this.query = query;
        this.path = path;
    }

    public String id(String name) {
        return path.get(name);
    }

    public String subject() {
        return identity.subject;
    }

    public String query(String name) {
        return query.path(name).asText(null);
    }

    public String value(String name) {
        return body.path(name).asText(null);
    }
}
