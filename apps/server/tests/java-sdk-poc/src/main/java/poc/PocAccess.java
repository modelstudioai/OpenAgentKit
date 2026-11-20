package poc;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
final class PocAccess {
    static final String SESSION_ID = "sess_poc";
    static final String DRAFT_ID = "draft_poc";
    static final String PROTOCOL_HEADER = "x-kit-protocol-version";
    private final String member;
    private final String admin;
    private final String internal;

    PocAccess(Environment environment) {
        member = environment.getRequiredProperty("POC_MEMBER_TOKEN");
        admin = environment.getRequiredProperty("POC_ADMIN_TOKEN");
        internal = environment.getRequiredProperty("POC_INTERNAL_TOKEN");
    }

    void session(String bearer, String id, String version) {
        require(bearer, member);
        if (!SESSION_ID.equals(id)) throw PocFailure.notFound();
        if (version == null || !version.matches("2\\.\\d+\\.\\d+"))
            throw PocFailure.conflict("需要 Kit 协议 2.x");
    }

    void draft(String bearer, String id) {
        admin(bearer);
        if (!DRAFT_ID.equals(id)) throw PocFailure.notFound();
    }

    void admin(String bearer) {
        require(bearer, admin);
    }

    void internal(String bearer) {
        require(bearer, internal);
    }

    static boolean equal(String a, String b) {
        return a != null && b != null
            && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static void require(String actual, String token) {
        if (!equal(actual, "Bearer " + token)) throw new PocFailure(401, "unauthorized", "身份无效");
    }
}
