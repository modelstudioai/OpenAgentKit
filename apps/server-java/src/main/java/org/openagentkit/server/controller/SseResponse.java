package org.openagentkit.server.controller;

import org.openagentkit.server.service.EventSink;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;

import javax.servlet.http.HttpServletResponse;

final class SseResponse implements EventSink {
    final SseEmitter emitter = new SseEmitter(0L);

    @Override
    public void onClose(Runnable close) {
        emitter.onCompletion(close);
        emitter.onTimeout(close);
        emitter.onError(error -> close.run());
    }

    @Override
    public void send(String type, String cursor, Object data) throws IOException {
        SseEmitter.SseEventBuilder event = SseEmitter.event().name(type).data(data, MediaType.APPLICATION_JSON);
        if (cursor != null) event.id(cursor);
        emitter.send(event);
    }

    @Override
    public void complete() {
        emitter.complete();
    }

    SseEmitter response(HttpServletResponse response) {
        response.setContentType(MediaType.TEXT_EVENT_STREAM_VALUE);
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("X-Accel-Buffering", "no");
        return emitter;
    }
}
