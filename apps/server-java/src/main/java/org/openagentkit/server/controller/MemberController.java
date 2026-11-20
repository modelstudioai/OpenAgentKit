package org.openagentkit.server.controller;

import org.openagentkit.server.KitJson;
import org.openagentkit.server.service.MemberService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
final class MemberController implements KitRoutes.Module {
    private static final String MEMBERS = "/api/admin/members";
    private static final String GROUPS = "/api/admin/groups";
    private final MemberService member;

    MemberController(MemberService member) {
        this.member = member;
    }

    @Override
    public void register(KitRoutes routes) {
        routes.add("GET", MEMBERS, call -> member.memberPage(call.input));
        routes.add("POST", MEMBERS, call -> {
            Map<String, Object> created = member.createMember(call.input);
            if (created.containsKey("initial_password")) call.response.setHeader("Cache-Control", "no-store");
            return ResponseEntity.status(201).body(KitJson.data(created));
        });
        routes.add("GET", MEMBERS + "/{memberId}", call -> member.detail(call.input.id("memberId")));
        routes.add("GET", MEMBERS + "/{memberId}/usage", call -> member.usage(call.input));
        routes.add("GET", MEMBERS + "/{memberId}/sessions", call -> member.sessions(call.input));
        routes.add("GET", MEMBERS + "/{memberId}/groups", call -> member.groupPage(call.input, call.input.id("memberId")));
        routes.add("PATCH", MEMBERS + "/{memberId}/groups", call -> member.changeMembers(call.input, false));
        routes.add("GET", GROUPS, call -> member.groupPage(call.input, null));
        routes.add("POST", GROUPS, call -> ResponseEntity.status(201).body(member.saveGroup(call.input, false)));
        routes.add("GET", GROUPS + "/{groupId}", call -> member.groupDetail(call.input.id("groupId")));
        routes.add("PATCH", GROUPS + "/{groupId}", call -> member.saveGroup(call.input, true));
        routes.add("POST", GROUPS + "/{groupId}/plan", call -> member.deletionPlan(call.input));
        routes.add("DELETE", GROUPS + "/{groupId}", call -> member.removeGroup(call.input));
        routes.add("GET", GROUPS + "/{groupId}/members", call -> member.groupMembers(call.input));
        routes.add("PATCH", GROUPS + "/{groupId}/members", call -> member.changeMembers(call.input, true));
    }
}
