package org.openagentkit.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public final class KitJson {
    private static final DateTimeFormatter MILLIS = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    public final ObjectMapper mapper;

    public KitJson(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public static String now() {
        return iso(Instant.now());
    }

    public static String iso(Instant instant) {
        return MILLIS.format(instant);
    }

    public String write(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法序列化 Kit 数据", exception);
        }
    }

    public JsonNode stored(Object value) {
        if (value == null) return mapper.nullNode();
        try {
            return mapper.readTree(value.toString());
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Kit 存储中的 JSON 格式无效");
        }
    }

    public ObjectNode object() {
        return mapper.createObjectNode();
    }

    public static Map<String, Object> fields(Object... keysAndValues) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index < keysAndValues.length; index += 2) {
            result.put((String) keysAndValues[index], keysAndValues[index + 1]);
        }
        return result;
    }

    public static Map<String, Object> data(Object value) {
        return fields("data", value);
    }
}
