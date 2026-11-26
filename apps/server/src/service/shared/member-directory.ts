import { Inject, Injectable } from "@nestjs/common";
import { KitError, type MembersPage, type MembersQuery, type MemberView } from "@openagentkit/sdk/protocol";
import { KitMembersEntity } from "../../entity/tables/kit-members.entity.ts";
import { StoreDatabase } from "../../store/database.ts";
import { likePattern } from "../../store/sql.ts";

type MemberRow = Omit<MemberView, "email"> & { email: string | null };
interface Cursor {
	created_at: string;
	member_id: string;
	search: string;
}

const MEMBER_COLUMNS = {
	member_id: true,
	username: true,
	display_name: true,
	email: true,
	auth_type: true,
	status: true,
	created_at: true,
	updated_at: true,
} as const;

function toView(row: MemberRow): MemberView {
	const { email, ...member } = row;
	return { ...member, ...(email ? { email } : {}) };
}

function readCursor(token: string | undefined, search: string): Cursor | undefined {
	if (!token) return undefined;
	try {
		const cursor: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
		if (
			cursor &&
			typeof cursor === "object" &&
			"created_at" in cursor &&
			typeof cursor.created_at === "string" &&
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.created_at) &&
			"member_id" in cursor &&
			typeof cursor.member_id === "string" &&
			/^member_[0-9a-f-]{36}$/.test(cursor.member_id) &&
			"search" in cursor &&
			cursor.search === search
		) {
			return { created_at: cursor.created_at, member_id: cursor.member_id, search };
		}
	} catch {
		// 不回显游标原文；它可能来自不可信输入。
	}
	throw new KitError("invalid_request", "成员分页游标无效或与搜索条件不匹配，请重新查询");
}

/** 成员目录与本地密码派生值；所有查询显式选择展示列，密码字段不进入视图。 */
@Injectable()
export class MemberDirectoryService {
	constructor(@Inject(StoreDatabase) private readonly db: StoreDatabase) {}

	async findById(memberId: string): Promise<MemberView | null> {
		const row = (await this.db.read((manager) =>
			manager.findOne(KitMembersEntity, {
				where: { member_id: memberId },
				select: MEMBER_COLUMNS,
			}),
		)) as MemberRow | null;
		return row ? toView(row) : null;
	}

	/** 仅供服务端密码验证使用；此返回值不可用于 API 或审计。 */
	async findCredentials(username: string): Promise<{ member: MemberView; passwordHash: string } | null> {
		const row = (await this.db.read((manager) =>
			manager.findOne(KitMembersEntity, {
				where: { username },
				select: { ...MEMBER_COLUMNS, password_hash: true },
			}),
		)) as (MemberRow & { password_hash: string }) | null;
		if (!row) return null;
		const { password_hash: passwordHash, ...view } = row;
		return { member: toView(view), passwordHash };
	}

	async list(options: MembersQuery): Promise<MembersPage> {
		const search = (options.search ?? "").toLowerCase();
		const cursor = readCursor(options.page_token, search);
		// LIKE 的通配符按字面搜索，避免用户名中的下划线匹配其他成员。
		const pattern = likePattern(search);
		const rows = (await this.db.read((manager) => {
			const query = manager
				.createQueryBuilder(KitMembersEntity, "member")
				.select(Object.keys(MEMBER_COLUMNS).map((column) => `member.${column}`))
				.where(
					"(LOWER(member.username) LIKE LOWER(:pattern) ESCAPE '!' OR LOWER(member.display_name) LIKE LOWER(:pattern) ESCAPE '!')",
					{ pattern },
				);
			if (cursor)
				query.andWhere("(member.created_at < :at OR (member.created_at = :at AND member.member_id < :id))", {
					at: cursor.created_at,
					id: cursor.member_id,
				});
			return query
				.orderBy("member.created_at", "DESC")
				.addOrderBy("member.member_id", "DESC")
				.take(options.limit + 1)
				.getMany();
		})) as MemberRow[];
		const data = rows.slice(0, options.limit).map(toView);
		const last = data.at(-1);
		return {
			data,
			...(rows.length > options.limit && last
				? {
						next_page_token: Buffer.from(
							JSON.stringify({ created_at: last.created_at, member_id: last.member_id, search }),
						).toString("base64url"),
					}
				: {}),
		};
	}
}
