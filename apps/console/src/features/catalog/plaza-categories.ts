import type { PlazaCategory } from "@openagentpack/kit-sdk/protocol";
import type { TFunction } from "i18next";

/** 分类枚举顺序固定；展示名称由 UI 词表提供，不依赖 SDK 的中文兜底名。 */
export const PLAZA_CATEGORIES: readonly PlazaCategory[] = ["general", "writing", "coding", "data", "other"];

export function plazaCategoryLabel(category: PlazaCategory, t: TFunction<"catalog">): string {
	switch (category) {
		case "general":
			return t("plazaCategories.general");
		case "writing":
			return t("plazaCategories.writing");
		case "coding":
			return t("plazaCategories.coding");
		case "data":
			return t("plazaCategories.data");
		case "other":
			return t("plazaCategories.other");
	}
}
