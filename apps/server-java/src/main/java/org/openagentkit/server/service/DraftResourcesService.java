package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.GatewayClient;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.openagentkit.server.store.KitDatabase.Row;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Base64;
import java.util.Map;
import java.util.function.Function;

@Service
public final class DraftResourcesService {

    private final DraftService drafts;
    private final PublicationService publications;
    private final GatewayClient gateway;
    private final KitConfig config;

    DraftResourcesService(DraftService drafts, PublicationService publications, GatewayClient gateway, KitConfig config) {
        this.drafts = drafts;
        this.publications = publications;
        this.gateway = gateway;
        this.config = config;
    }

    public Object stage(RequestContext call, String kind, String revision, FileUpload file) throws IOException {
        if (file.size > config.uploadLimit()) throw KitError.bodyTooLarge();
        String name = file.filename;
        if (name == null || name.isBlank() || revision == null) throw KitError.invalidRequest();
        byte[] bytes = file.bytes();
        return edit(call, row -> {
            String id = call.id("name");
            if (!Long.toString(drafts.document(id).integer("revision")).equals(revision))
                throw KitError.conflict("批次配置已变化，请重新加载");
            JsonNode upload = gateway.call("draftStage", id, call.subject(), revision, kind, name,
                Base64.getEncoder().encodeToString(bytes));
            return KitJson.data(upload);
        });
    }

    public Object uploadCommand(RequestContext call, String kind, boolean commit) {
        return edit(call, row -> KitJson.data(gateway.call("draftUploads", call.id("name"), call.subject(), kind, commit, call.body)));
    }

    public Object discard(RequestContext call, String cleanupKey) {
        String id = call.id("draftId");
        return drafts.lock(id, () -> {
            Row draft = drafts.get(id);
            if (draft == null) return KitJson.data(Map.of("discarded", false));
            if (!call.subject().equals(draft.text("owner"))) throw KitError.missing("资源发布批次不存在");
            if (draft.text("status").equals("published")) return KitJson.data(Map.of("discarded", false));
            drafts.checkCleanupKey(draft, validateCleanupKey(cleanupKey));
            drafts.discard(draft);
            return KitJson.data(Map.of("discarded", true));
        });
    }

    public Object read(RequestContext call, String method, Object... args) {
        drafts.owned(call.id("name"), call.subject());
        return KitJson.data(drafts.invoke(call.id("name"), method, args));
    }

    private Object edit(RequestContext call, Function<Row, Object> work) {
        String id = call.id("name");
        return drafts.lock(id, () -> {
            Row draft = drafts.owned(id, call.subject());
            drafts.editable(draft);
            return work.apply(draft);
        });
    }

    public Object active(String subject, String cleanupKey) {
        return KitJson.data(drafts.view(drafts.active(subject, validateCleanupKey(cleanupKey))));
    }

    public Object create(String subject, String cleanupKey) {
        return KitJson.data(drafts.view(drafts.create(subject, validateCleanupKey(cleanupKey))));
    }

    public Object draft(String id, String subject) {
        return KitJson.data(drafts.view(drafts.owned(id, subject)));
    }

    public Object finalizeDraft(String id, String subject) {
        return drafts.lock(id, () -> {
            publications.finalizeDraft(drafts.owned(id, subject));
            return draft(id, subject);
        });
    }

    public Object overview(RequestContext call) {
        Row draft = drafts.owned(call.id("name"), call.subject());
        if (draft.text("status").equals("published")) {
            return KitJson.data(Map.of("published", Map.of("resources", drafts.publicBindings(draft))));
        }
        return KitJson.data(drafts.invoke(call.id("name"), "overview"));
    }

    public Object bindings(RequestContext call) {
        Row draft = drafts.owned(call.id("name"), call.subject());
        if (draft.text("status").equals("published")) return KitJson.data(Map.of("resources", drafts.publicBindings(draft)));
        return KitJson.data(drafts.invoke(call.id("name"), "resourceBindings"));
    }

    public Object modify(RequestContext call, String command, Object... args) {
        return edit(call, row -> KitJson.data(drafts.invoke(call.id("name"), command, args)));
    }

    public Object plan(RequestContext call) {
        return edit(call, draft -> KitJson.data(publications.plan(draft)));
    }

    public Object publish(RequestContext call) {
        return drafts.lock(call.id("name"), () -> {
            Row draft = drafts.owned(call.id("name"), call.subject());
            return KitJson.data(Map.of("operation_id", publications.start(draft, call)));
        });
    }

    public Object cancelUpload(RequestContext call, String kind) {
        return edit(call, row -> KitJson.data(gateway.call("draftCancelUpload", call.id("name"), call.subject(), kind, call.id("uploadId"))));
    }

    private static String validateCleanupKey(String key) {
        if (key != null && !key.matches("(?i)[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}")) throw KitError.invalidRequest();
        return key;
    }
}
