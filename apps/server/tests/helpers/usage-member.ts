import type { DatabaseSync } from "node:sqlite";
import type { MemberView } from "@openagentkit/sdk/protocol";
import { KitMembersEntity } from "../../src/entity/tables/kit-members.entity.ts";
import { createSqliteDatabase } from "../../src/store/sqlite.ts";

export async function seedUsageMember(db: DatabaseSync, member: MemberView, passwordHash: string) {
	await createSqliteDatabase(db).write((manager) =>
		manager.insert(KitMembersEntity, { ...member, email: member.email ?? null, password_hash: passwordHash }),
	);
	return member;
}
