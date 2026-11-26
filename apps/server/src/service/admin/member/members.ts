import { randomInt, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	type CreateMemberRequest,
	CreateMemberRequestSchema,
	type CreateMemberResponse,
	KitError,
	type MembersQuery,
	MembersQuerySchema,
} from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../../../config.ts";
import { KitMembersEntity } from "../../../entity/tables/kit-members.entity.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { KIT_CONFIG } from "../../../utils/injection-tokens.ts";
import { hashPassword } from "../../../utils/passwords.ts";
import { AuditService } from "../../shared/audit.ts";
import { MemberDirectoryService } from "../../shared/member-directory.ts";
import { MemberUsageService } from "../../shared/member-usage.ts";
import { OidcAuthService } from "../../shared/oidc-auth.ts";
import { GroupService } from "./groups.ts";

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

@Injectable()
export class MemberService {
	constructor(
		@Inject(MemberDirectoryService) private readonly directory: MemberDirectoryService,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(GroupService) private readonly groups: GroupService,
		@Inject(MemberUsageService) private readonly memberUsage: MemberUsageService,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(KIT_CONFIG) private readonly config: ServerConfig,
		@Inject(OidcAuthService) private readonly oidcAuth: OidcAuthService,
	) {}

	async get(memberId: string) {
		const member = await this.directory.findById(memberId);
		if (!member) throw new KitError("not_found", "成员不存在");
		return member;
	}

	async list(input: MembersQuery) {
		const parsed = MembersQuerySchema.safeParse(input);
		if (!parsed.success) throw new KitError("invalid_request", "成员查询参数无效");
		return await this.directory.list(parsed.data);
	}

	async listWithUsage(input: MembersQuery) {
		const page = await this.list(input);
		const groups = await this.groups.summaries(page.data.map((member) => member.member_id));
		return {
			...page,
			data: await Promise.all(
				page.data.map(async (member) => ({
					...member,
					groups: groups.get(member.member_id) ?? [],
					usage_summary: await this.memberUsage.summary(member.member_id),
				})),
			),
		};
	}

	async create(input: CreateMemberRequest, subject: string): Promise<CreateMemberResponse["data"]> {
		// 服务入口也校验，避免非 HTTP 调用绕过密码规则；异常不能携带原始输入。
		const parsed = CreateMemberRequestSchema.safeParse(input);
		if (!parsed.success) throw new KitError("invalid_request", parsed.error.issues[0]?.message ?? "成员参数无效");
		const value = parsed.data;
		if (!this.config.passwordLogin && value.password_mode === "custom")
			throw new KitError("invalid_request", "企业登录模式下无需设置成员密码");
		if (value.oidc_binding && !this.config.oidc) throw new KitError("invalid_request", "当前部署未配置 Keycloak");
		const password = value.password_mode === "auto" ? generatePassword(value.username) : value.password;
		const passwordHash = await hashPassword(password);
		const now = new Date().toISOString();
		const member = {
			member_id: `member_${randomUUID()}`,
			username: value.username,
			display_name: value.display_name,
			...(value.email ? { email: value.email } : {}),
			auth_type: "local" as const,
			status: "active" as const,
			created_at: now,
			updated_at: now,
		};
		return await this.db.transaction(async () => {
			const inserted = await this.db.insertEntityIfAbsent(
				KitMembersEntity,
				{ ...member, email: member.email ?? null, password_hash: passwordHash },
				["username"],
			);
			if (!inserted) throw new KitError("conflict", "用户名已存在，请使用其他用户名");
			await this.audit.append({ subject, action: "members.create", target: member.member_id });
			const result: CreateMemberResponse["data"] = { member };
			if (value.oidc_binding)
				result.oidc_binding = await this.oidcAuth.bind(member.member_id, value.oidc_binding.sub, subject);
			if (this.config.passwordLogin && value.password_mode === "auto") result.initial_password = password;
			return result;
		});
	}
}
