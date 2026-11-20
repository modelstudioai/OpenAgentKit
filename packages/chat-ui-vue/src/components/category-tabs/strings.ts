import type { KitStringTable } from "../kit-i18n/index.ts";

export interface CategoryTabsStrings {
	featured: string;
	aria: string;
}

const categoryTabsStrings: KitStringTable<CategoryTabsStrings> = {
	"zh-CN": { featured: "精选", aria: "广场分类" },
	en: { featured: "Featured", aria: "Plaza categories" },
};

export default categoryTabsStrings;
export { categoryTabsStrings };
