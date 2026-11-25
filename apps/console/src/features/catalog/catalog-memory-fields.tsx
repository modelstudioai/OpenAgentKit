import i18n from "i18next";

export interface CatalogMemoryDraft {
	key: string;
	memory_store_id: string;
	access: "read_only" | "read_write";
	instructions: string;
}

const MAX_MEMORIES = 8;
const MAX_INSTRUCTIONS = 4090;

/** 默认空行不写入草稿；显式添加或编辑的行必须先选择记忆库。 */
export function validateCatalogMemories(value: CatalogMemoryDraft[]): string | null {
	const t = i18n.getFixedT(null, "catalog");
	if (value.length > MAX_MEMORIES) return t("memory.max", { max: MAX_MEMORIES });
	const ids = new Set<string>();
	for (const [index, memory] of value.entries()) {
		const memoryId = memory.memory_store_id.trim();
		if (!memoryId) return t("memory.choose", { index: index + 1 });
		if (ids.has(memoryId)) return t("memory.duplicate");
		if (memory.access !== "read_only" && memory.access !== "read_write")
			return t("memory.access", { index: index + 1 });
		if (memory.instructions.length > MAX_INSTRUCTIONS)
			return t("memory.instructions", { index: index + 1, max: MAX_INSTRUCTIONS });
		ids.add(memoryId);
	}
	return null;
}
