import { randomInt, randomUUID } from "node:crypto";
import {
	type CreateMemberRequest,
	CreateMemberRequestSchema,
	type CreateMemberResponse,
	KitError,
	type MembersQuery,
	MembersQuerySchema,
} from "@openagentkit/sdk/protocol";
import type { AuditLog } from "../store/audit.ts";
import type { MemberStore } from "../store/members.ts";
import type { OidcAuthService } from "./oidc-auth.ts";
import { hashPassword } from "./passwords.ts";

const PASSWORD_CLASSES = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*_-+=?"];
const PASSWORD_ALPHABET = PASSWORD_CLASSES.join("");

function generatePassword(username: string): string {
	for (;;) {
		const chars = PASSWORD_CLASSES.map((alphabet) => alphabet[randomInt(alphabet.length)] as string);
		while (chars.length < 20) chars.push(PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)] as string);
		for (let i = chars.length - 1; i > 0; i--) {
			const j = randomInt(i + 1);
			[chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
		}
		const password = chars.join("");
		if (!password.toLowerCase().includes(username)) return password;
	}
}

export function createMemberService({
	store,
	audit,
	passwordLogin,
	oidcAuth,
}: {
	store: MemberStore;
	audit: AuditLog;
	passwordLogin: boolean;
	oidcAuth?: OidcAuthService;
}) {
	return {
		async get(memberId: string) {
			const member = await store.findById(memberId);
			if (!member) throw new KitError("not_found", "成员不存在");
			return member;
		},
		async list(input: MembersQuery) {
			const parsed = MembersQuerySchema.safeParse(input);
			if (!parsed.success) throw new KitError("invalid_request", "成员查询参数无效");
			return await store.list(parsed.data);
		},
		async create(input: CreateMemberRequest, subject: string): Promise<CreateMemberResponse["data"]> {
			// 服务入口也校验，避免非 HTTP 调用绕过密码规则；异常不能携带原始输入。
			const parsed = CreateMemberRequestSchema.safeParse(input);
			if (!parsed.success) throw new KitError("invalid_request", parsed.error.issues[0]?.message ?? "成员参数无效");
			const value = parsed.data;
			if (!passwordLogin && value.password_mode === "custom")
				throw new KitError("invalid_request", "企业登录模式下无需设置成员密码");
			if (value.oidc_binding && !oidcAuth) throw new KitError("invalid_request", "当前部署未配置 Keycloak");
			const password = value.password_mode === "auto" ? generatePassword(value.username) : value.password;
			const passwordHash = await hashPassword(password);
			const now = new Date().toISOString();
			return await store.transaction(async () => {
				const member = await store.create(
					{
						member_id: `member_${randomUUID()}`,
						username: value.username,
						display_name: value.display_name,
						...(value.email ? { email: value.email } : {}),
						auth_type: "local",
						status: "active",
						created_at: now,
						updated_at: now,
					},
					passwordHash,
				);
				await audit.append({ subject, action: "members.create", target: member.member_id });
				const result: CreateMemberResponse["data"] = { member };
				if (value.oidc_binding && oidcAuth)
					result.oidc_binding = await oidcAuth.bind(member.member_id, value.oidc_binding.sub, subject);
				if (passwordLogin && value.password_mode === "auto") result.initial_password = password;
				return result;
			});
		},
	};
}

export type MemberService = ReturnType<typeof createMemberService>;
