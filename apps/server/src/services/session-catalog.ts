import { KitError } from "@openagentkit/sdk/protocol";
import type { CatalogStore } from "../store/catalog.ts";

/** 继续执行前校验会话原来绑定的目录条目。slug 可以复用，旧会话仍只读。 */
export async function requireExecutableSession(
	catalog: Pick<CatalogStore, "get">,
	session: { catalog_entry_id: string | null; agent_slug: string | null },
): Promise<void> {
	if (!session.agent_slug) return;
	const entry = session.catalog_entry_id ? await catalog.get(session.catalog_entry_id) : null;
	if (!entry || entry.deleted) throw new KitError("forbidden", "该智能体已删除，会话仅可查看历史");
}
