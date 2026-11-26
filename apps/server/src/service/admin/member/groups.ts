import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	type ApplyRequest,
	type GroupInput,
	GroupInputSchema,
	type GroupMembershipQuery,
	GroupMembershipQuerySchema,
	type GroupMembersPage,
	type GroupMembersPatch,
	GroupMembersPatchSchema,
	type GroupSummary,
	type GroupsPage,
	type GroupsQuery,
	GroupsQuerySchema,
	type GroupView,
	KitError,
	type MemberGroupsPage,
	type MemberGroupsPatch,
	MemberGroupsPatchSchema,
	type MemberView,
	type PlanResponse,
} from "@openagentkit/sdk/protocol";
import { type EntityManager, Not, type ObjectLiteral, type SelectQueryBuilder } from "typeorm";
import type { z } from "zod";
import { KitGroupMembersEntity } from "../../../entity/tables/kit-group-members.entity.ts";
import { KitGroupsEntity } from "../../../entity/tables/kit-groups.entity.ts";
import { KitMembersEntity } from "../../../entity/tables/kit-members.entity.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { likePattern } from "../../../store/sql.ts";
import { AuditService } from "../../shared/audit.ts";
import { ConfirmGate } from "../../shared/confirm-gate.ts";

function validated<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) throw new KitError("invalid_request", parsed.error.issues[0]?.message ?? "用户组参数无效");
	return parsed.data;
}

type GroupRow = Omit<GroupView, "description"> & { description: string | null };
type MemberRow = Omit<MemberView, "email"> & { email: string | null; is_member: number };
interface Cursor {
	created_at: string;
	id: string;
	context: string;
}
function groupRows(manager: EntityManager) {
	const query = manager.createQueryBuilder(KitGroupsEntity, "g").select([]);
	for (const field of ["group_id", "name", "description", "revision", "created_at", "updated_at"] as const) {
		query.addSelect(`g.${field}`, field);
	}
	return query.addSelect(
		(sub) => sub.select("COUNT(*)").from(KitGroupMembersEntity, "gm").where("gm.group_id = g.group_id"),
		"member_count",
	);
}

function membership<T extends ObjectLiteral>(
	query: SelectQueryBuilder<T>,
	selection: GroupMembershipQuery["membership"],
) {
	query.addSelect("CASE WHEN link.member_id IS NULL THEN 0 ELSE 1 END", "is_member");
	if (selection === "excluded") query.andWhere("link.member_id IS NULL");
	if (selection === "included") query.andWhere("link.member_id IS NOT NULL");
}

function pagedGroups(manager: EntityManager, search: string, cursor: Cursor | undefined, limit: number) {
	const query = groupRows(manager)
		.where("(LOWER(g.name) LIKE :pattern ESCAPE '!' OR LOWER(g.description) LIKE :pattern ESCAPE '!')", {
			pattern: likePattern(search),
		})
		.orderBy("g.created_at", "DESC")
		.addOrderBy("g.group_id", "DESC")
		.limit(limit + 1);
	if (cursor)
		query.andWhere("(g.created_at < :created_at OR (g.created_at = :created_at AND g.group_id < :id))", cursor);
	return query;
}
const asGroup = ({ description, ...row }: GroupRow): GroupView => ({ ...row, ...(description ? { description } : {}) });

function cursorFor(token: string | undefined, context: string): Cursor | undefined {
	if (!token) return undefined;
	try {
		const value: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
		if (
			value &&
			typeof value === "object" &&
			"context" in value &&
			value.context === context &&
			"id" in value &&
			typeof value.id === "string" &&
			/^(group|member)_[0-9a-f-]{36}$/.test(value.id) &&
			"created_at" in value &&
			typeof value.created_at === "string" &&
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.created_at)
		) {
			return { id: value.id, created_at: value.created_at, context };
		}
	} catch {
		/* 游标不能回显不可信原文。 */
	}
	throw new KitError("invalid_request", "分页游标无效或与当前查询不匹配，请重新查询");
}

function page<T extends { created_at: string }>(rows: T[], limit: number, context: string, id: (row: T) => string) {
	const data = rows.slice(0, limit);
	const last = data.at(-1);
	return {
		data,
		...(rows.length > limit && last
			? {
					next_page_token: Buffer.from(JSON.stringify({ created_at: last.created_at, id: id(last), context })).toString(
						"base64url",
					),
				}
			: {}),
	};
}

@Injectable()
export class GroupService {
	constructor(
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(ConfirmGate) private readonly gate: ConfirmGate,
	) {}

	async create(input: GroupInput, subject: string) {
		const group = await this.insertGroup(validated(GroupInputSchema, input));
		await this.audit.append({ subject, action: "groups.create", target: group.group_id });
		return group;
	}

	async update(groupId: string, input: GroupInput, subject: string) {
		const group = await this.updateDetails(groupId, validated(GroupInputSchema, input));
		await this.audit.append({
			subject,
			action: "groups.update",
			target: groupId,
			detail: { revision: group.revision },
		});
		return group;
	}

	async updateGroupMembers(groupId: string, input: GroupMembersPatch, subject: string) {
		const patch = validated(GroupMembersPatchSchema, input);
		const group = await this.changeMembers(groupId, patch.add_member_ids, patch.remove_member_ids);
		await this.audit.append({ subject, action: "groups.members.update", target: groupId, detail: patch });
		return group;
	}

	async updateMemberGroups(memberId: string, input: MemberGroupsPatch, subject: string) {
		const patch = validated(MemberGroupsPatchSchema, input);
		await this.changeGroups(memberId, patch.add_group_ids, patch.remove_group_ids);
		await this.audit.append({ subject, action: "members.groups.update", target: memberId, detail: patch });
		return { updated: true as const };
	}

	async planDelete(groupId: string, subject: string): Promise<PlanResponse> {
		const group = await this.get(groupId);
		// 身份、目标与快照版本由签名共同绑定；随机 nonce 保证每次确认只能消费一次。
		const planId = `group_delete:${groupId}:${group.revision}:${randomUUID()}`;
		const issued = await this.gate.issue({ planId, action: `groups.delete:${groupId}`, subject });
		return {
			plan_id: planId,
			confirm_token: issued.confirmToken,
			expires_at: issued.expiresAt,
			destructive: true,
			diff: [
				{
					resource: `group:${groupId}`,
					action: "delete",
					destructive: true,
					summary: `删除用户组「${group.name}」，移除 ${group.member_count} 位成员的组关联；用户账号、会话与历史数据保留。`,
				},
			],
		};
	}

	async remove(groupId: string, input: Partial<ApplyRequest>, subject: string) {
		const planId = input.plan_id ?? "";
		await this.gate.consume({ planId, action: `groups.delete:${groupId}`, subject, token: input.confirm_token ?? "" });
		const parts = planId.split(":");
		const revision = Number(parts[2]);
		if (
			parts.length !== 4 ||
			parts[0] !== "group_delete" ||
			parts[1] !== groupId ||
			!Number.isSafeInteger(revision) ||
			revision < 1
		) {
			throw new KitError("confirmation_required", "删除确认计划无效");
		}
		// gate.consume 会 await：数据库事务内再次检查，防止期间成员变化或另一管理员修改。
		await this.deleteAtRevision(groupId, revision);
		await this.audit.append({ subject, action: "groups.delete", target: groupId });
		return { deleted: true as const };
	}

	async get(groupId: string): Promise<GroupView> {
		const row = await this.db.read((manager) =>
			groupRows(manager).where("g.group_id = :groupId", { groupId }).getRawOne<GroupRow>(),
		);
		if (!row) throw new KitError("not_found", "用户组不存在");
		return asGroup(row);
	}

	private async requireMember(memberId: string) {
		if (!(await this.db.read((manager) => manager.existsBy(KitMembersEntity, { member_id: memberId }))))
			throw new KitError("not_found", "成员不存在");
	}

	private async bump(groupId: string) {
		await this.db.write((manager) =>
			manager.update(
				KitGroupsEntity,
				{ group_id: groupId },
				{ revision: () => "revision + 1", updated_at: new Date().toISOString() },
			),
		);
	}

	private async change(groupId: string, memberId: string, add: boolean): Promise<boolean> {
		const key = { group_id: groupId, member_id: memberId };
		if (add) return this.db.insertEntityIfAbsent(KitGroupMembersEntity, key);
		return this.db.write(async (manager) => Boolean((await manager.delete(KitGroupMembersEntity, key)).affected));
	}

	private async changeAndBump(groupId: string, memberId: string, add: boolean) {
		if (await this.change(groupId, memberId, add)) await this.bump(groupId);
	}

	private async insertGroup(input: GroupInput): Promise<GroupView> {
		const id = `group_${randomUUID()}`;
		const now = new Date().toISOString();
		const inserted = await this.db.insertEntityIfAbsent(
			KitGroupsEntity,
			{
				group_id: id,
				name: input.name,
				description: input.description ?? null,
				created_at: now,
				updated_at: now,
			},
			["name"],
		);
		if (!inserted) throw new KitError("conflict", "用户组名称已存在");
		return await this.get(id);
	}

	private async updateDetails(groupId: string, input: GroupInput): Promise<GroupView> {
		return await this.db.transaction(async () => {
			const current = await this.get(groupId);
			if (
				await this.db.read((manager) => manager.existsBy(KitGroupsEntity, { name: input.name, group_id: Not(groupId) }))
			) {
				throw new KitError("conflict", "用户组名称已存在");
			}
			const description = input.description ?? current.description;
			if (current.name !== input.name || (current.description ?? "") !== (description ?? "")) {
				await this.db.write((manager) =>
					manager.update(
						KitGroupsEntity,
						{ group_id: groupId },
						{ name: input.name, description: description ?? null },
					),
				);
				await this.bump(groupId);
			}
			return await this.get(groupId);
		});
	}

	async list(input: GroupsQuery): Promise<GroupsPage> {
		const query = validated(GroupsQuerySchema, input);
		const search = (query.search ?? "").toLowerCase();
		const context = JSON.stringify(["groups", search]);
		const cursor = cursorFor(query.page_token, context);
		const rows = await this.db.read((manager) =>
			pagedGroups(manager, search, cursor, query.limit).getRawMany<GroupRow>(),
		);
		return page(rows.map(asGroup), query.limit, context, (row) => row.group_id);
	}

	async memberGroups(memberId: string, input: GroupMembershipQuery): Promise<MemberGroupsPage> {
		const query = validated(GroupMembershipQuerySchema, input);
		await this.requireMember(memberId);
		const search = (query.search ?? "").toLowerCase();
		const context = JSON.stringify(["member-groups", memberId, query.membership, search]);
		const cursor = cursorFor(query.page_token, context);
		const rows = await this.db.read((manager) => {
			const groups = pagedGroups(manager, search, cursor, query.limit).leftJoin(
				KitGroupMembersEntity,
				"link",
				"link.group_id = g.group_id AND link.member_id = :memberId",
				{ memberId },
			);
			membership(groups, query.membership);
			return groups.getRawMany<GroupRow & { is_member: number }>();
		});
		return page(
			rows.map(({ is_member, ...row }) => ({ ...asGroup(row), is_member: Boolean(is_member) })),
			query.limit,
			context,
			(row) => row.group_id,
		);
	}

	async groupMembers(groupId: string, input: GroupMembershipQuery): Promise<GroupMembersPage> {
		const query = validated(GroupMembershipQuerySchema, input);
		await this.get(groupId);
		const search = (query.search ?? "").toLowerCase();
		const context = JSON.stringify(["group-members", groupId, query.membership, search]);
		const cursor = cursorFor(query.page_token, context);
		const rows = await this.db.read((manager) => {
			const members = manager
				.createQueryBuilder(KitMembersEntity, "m")
				.select([])
				.leftJoin(KitGroupMembersEntity, "link", "link.member_id = m.member_id AND link.group_id = :groupId", {
					groupId,
				})
				.where("(LOWER(m.username) LIKE :pattern ESCAPE '!' OR LOWER(m.display_name) LIKE :pattern ESCAPE '!')", {
					pattern: likePattern(search),
				})
				.orderBy("m.created_at", "DESC")
				.addOrderBy("m.member_id", "DESC")
				.limit(query.limit + 1);
			for (const field of [
				"member_id",
				"username",
				"display_name",
				"email",
				"auth_type",
				"status",
				"created_at",
				"updated_at",
			] as const) {
				members.addSelect(`m.${field}`, field);
			}
			membership(members, query.membership);
			if (cursor)
				members.andWhere("(m.created_at < :created_at OR (m.created_at = :created_at AND m.member_id < :id))", cursor);
			return members.getRawMany<MemberRow>();
		});
		return page(
			rows.map(({ email, is_member, ...row }) => ({
				...row,
				...(email ? { email } : {}),
				is_member: Boolean(is_member),
			})),
			query.limit,
			context,
			(row) => row.member_id,
		);
	}

	private async changeMembers(groupId: string, add: string[], remove: string[]): Promise<GroupView> {
		return await this.db.transaction(async () => {
			await this.get(groupId);
			for (const id of new Set([...add, ...remove])) await this.requireMember(id);
			let changed = false;
			for (const id of add) changed = (await this.change(groupId, id, true)) || changed;
			for (const id of remove) changed = (await this.change(groupId, id, false)) || changed;
			if (changed) await this.bump(groupId);
			return await this.get(groupId);
		});
	}

	private async changeGroups(memberId: string, add: string[], remove: string[]): Promise<void> {
		await this.db.transaction(async () => {
			await this.requireMember(memberId);
			for (const id of new Set([...add, ...remove])) await this.get(id);
			for (const id of add) await this.changeAndBump(id, memberId, true);
			for (const id of remove) await this.changeAndBump(id, memberId, false);
		});
	}

	async summaries(memberIds: string[]): Promise<Map<string, GroupSummary[]>> {
		const result = new Map<string, GroupSummary[]>();
		if (!memberIds.length) return result;
		const rows = await this.db.read((manager) =>
			manager
				.createQueryBuilder(KitGroupMembersEntity, "gm")
				.innerJoin(KitGroupsEntity, "g", "g.group_id = gm.group_id")
				.select("gm.member_id", "member_id")
				.addSelect("g.group_id", "group_id")
				.addSelect("g.name", "name")
				.where("gm.member_id IN (:...memberIds)", { memberIds })
				.orderBy("g.name", "ASC")
				.addOrderBy("g.group_id", "ASC")
				.getRawMany<{ member_id: string; group_id: string; name: string }>(),
		);
		for (const { member_id, ...group } of rows) {
			const groups = result.get(member_id) ?? [];
			groups.push(group);
			result.set(member_id, groups);
		}
		return result;
	}

	private async deleteAtRevision(groupId: string, revision: number): Promise<void> {
		await this.db.transaction(async () => {
			if ((await this.get(groupId)).revision !== revision)
				throw new KitError("conflict", "用户组或成员关系已变化，请重新预览删除影响并确认");
			await this.db.write((manager) => manager.delete(KitGroupMembersEntity, { group_id: groupId }));
			await this.db.write((manager) => manager.delete(KitGroupsEntity, { group_id: groupId }));
		});
	}
}
