package org.openagentkit.server.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.openagentkit.server.KitError;

import java.math.BigDecimal;
import java.util.Iterator;
import java.util.Map;
import java.util.regex.Pattern;

final class RequestSchema {
    private RequestSchema() {}

    static JsonNode parseString(String value, JsonNode schema) {
        try {
            switch (schema.path("type").asText()) {
                case "integer":
                case "number":
                    return JsonNodeFactory.instance.numberNode(new BigDecimal(value.trim()));
                case "boolean":
                    if (!value.equals("true") && !value.equals("false")) throw invalid();
                    return JsonNodeFactory.instance.booleanNode(Boolean.parseBoolean(value));
                default:
                    return JsonNodeFactory.instance.textNode(value);
            }
        } catch (NumberFormatException error) {
            throw invalid();
        }
    }

    static JsonNode apply(JsonNode value, JsonNode schema) {
        if (value.isNull() && schema.path("nullable").asBoolean()) return value;
        for (String alternative : new String[] { "oneOf", "anyOf" }) {
            if (schema.has(alternative)) {
                for (JsonNode option : schema.get(alternative)) {
                    try {
                        return apply(value, option);
                    } catch (KitError ignored) {
                        // 尝试其余 OpenAPI 分支。
                    }
                }
                throw invalid();
            }
        }
        if (schema.has("enum")) {
            boolean found = false;
            for (JsonNode candidate : schema.get("enum")) {
                if (candidate.equals(value)) found = true;
            }
            if (!found) throw invalid();
        }
        switch (schema.path("type").asText()) {
            case "object": return object(value, schema);
            case "array":
                if (!value.isArray() || value.size() < schema.path("minItems").asInt()
                    || value.size() > schema.path("maxItems").asInt(Integer.MAX_VALUE)) throw invalid();
                ArrayNode result = JsonNodeFactory.instance.arrayNode();
                for (JsonNode item : value) result.add(apply(item, schema.path("items")));
                return result;
            case "string":
                if (!value.isTextual()) throw invalid();
                String text = value.asText();
                if (text.length() < schema.path("minLength").asInt()
                    || text.length() > schema.path("maxLength").asInt(Integer.MAX_VALUE)
                    || schema.has("pattern") && !Pattern.compile(schema.path("pattern").asText()).matcher(text).find()) {
                    throw invalid();
                }
                if (schema.path("format").asText().equals("email") && !text.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) {
                    throw invalid();
                }
                return value;
            case "integer":
            case "number":
                if (!value.isNumber() || schema.path("type").asText().equals("integer")
                    && value.decimalValue().stripTrailingZeros().scale() > 0) throw invalid();
                double number = value.doubleValue();
                if (!Double.isFinite(number) || number < schema.path("minimum").asDouble(Double.NEGATIVE_INFINITY)
                    || number > schema.path("maximum").asDouble(Double.POSITIVE_INFINITY)
                    || schema.path("exclusiveMinimum").asBoolean() && number == schema.path("minimum").asDouble()) {
                    throw invalid();
                }
                return value;
            case "boolean":
                if (!value.isBoolean()) throw invalid();
                return value;
            default: return value;
        }
    }

    private static JsonNode object(JsonNode value, JsonNode schema) {
        if (!value.isObject()) throw invalid();
        ObjectNode result = JsonNodeFactory.instance.objectNode();
        JsonNode properties = schema.path("properties");
        JsonNode additional = schema.path("additionalProperties");
        Iterator<Map.Entry<String, JsonNode>> fields = value.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String name = entry.getKey();
            if (properties.has(name)) result.set(name, apply(entry.getValue(), properties.get(name)));
            else if (additional.isObject()) result.set(name, apply(entry.getValue(), additional));
            else if (additional.asBoolean() || properties.isMissingNode()) result.set(name, entry.getValue());
        }
        properties.fields().forEachRemaining(property -> {
            if (!result.has(property.getKey()) && property.getValue().has("default")) {
                result.set(property.getKey(), property.getValue().get("default"));
            }
        });
        for (JsonNode key : schema.path("required")) {
            if (!result.has(key.asText())) throw invalid();
        }
        return result;
    }

    static KitError invalid() {
        return KitError.invalidRequest();
    }
}
