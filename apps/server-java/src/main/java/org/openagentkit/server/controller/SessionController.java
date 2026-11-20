package org.openagentkit.server.controller;

import org.openagentkit.server.service.FileDownload;
import org.openagentkit.server.service.SessionService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Component
final class SessionController implements KitRoutes.Module {
    private static final String KIT = "/api/kit";
    private final SessionService session;

    SessionController(SessionService session) {
        this.session = session;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", KIT + "/agents", call -> session.agents());
        routes.add("GET", KIT + "/agents/{slug}", call -> session.agentDetail(call.input));
        routes.add("GET", KIT + "/session-agents", call -> session.sessionAgents(call.input));
        routes.add("GET", KIT + "/sessions", call -> session.directory(call.input));
        routes.add("PATCH", KIT + "/sessions/{sessionId}", call -> session.rename(call.input));
        routes.add("POST", KIT + "/sessions/{sessionId}/archive", call -> session.archive(call.input));
        routes.add("GET", KIT + "/files/{fileId}", call -> session.fileStatus(call.input));
        registerSessions(routes, KIT, "experience");
        registerSessions(routes, "/api/admin/debug", "admin_debug");
    }

    private void registerSessions(KitRoutes routes, String prefix, String purpose) {
        String path = prefix + "/sessions/{sessionId}";
        routes.add("POST", prefix + "/sessions", call -> ResponseEntity.status(201).body(session.create(call.input, purpose)));
        routes.add("GET", path, call -> session.session(call.input, purpose));
        routes.add("GET", path + "/stream", call -> {
            SseResponse stream = new SseResponse();
            session.subscribe(call.input, purpose, stream);
            return stream.response(call.response);
        });
        routes.add("POST", path + "/messages", call -> ResponseEntity.accepted().body(session.send(call.input, purpose)));
        routes.add("GET", path + "/events", call -> session.events(call.input, purpose));
        routes.add("GET", path + "/threads", call -> session.threads(call.input, purpose));
        routes.add("GET", path + "/threads/{threadId}/events", call -> session.threadEvents(call.input, purpose));
        routes.add("GET", path + "/tool-approvals", call -> session.approvals(call.input, purpose));
        routes.add("POST", path + "/tool-approvals", call -> session.decision(call.input, purpose));
        routes.add("POST", path + "/interrupt", call -> session.interrupt(call.input, purpose));
        routes.add("POST", path + "/plan", call -> session.plan(call.input, purpose));
        routes.add("DELETE", path, call -> session.remove(call.input, purpose));
        routes.add("POST", prefix + "/files", call ->
            ResponseEntity.status(201).body(session.upload(call.input, purpose, Uploads.single(call.request))));
        routes.add("GET", prefix + "/files/{fileId}/download", call -> download(session.download(call.input, purpose)));
    }

    private ResponseEntity<byte[]> download(FileDownload file) {
        MediaType type;
        try {
            type = MediaType.parseMediaType(file.contentType);
        } catch (IllegalArgumentException error) {
            type = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok().contentType(type)
            .header("Content-Disposition", ContentDisposition.attachment().filename(file.filename, StandardCharsets.UTF_8).build().toString())
            .header("Content-Security-Policy", "sandbox; default-src 'none'")
            .header("X-Content-Type-Options", "nosniff").body(file.bytes);
    }
}
