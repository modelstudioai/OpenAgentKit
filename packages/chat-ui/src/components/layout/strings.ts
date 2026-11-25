import type { KitStringTable } from "../kit-i18n/index.ts";

export interface LayoutStrings {
	closeAria: string;
	openAria: string;
	sidebarLabel: string;
	asideLabel: string;
}

const layoutStrings: KitStringTable<LayoutStrings> = {
	"zh-CN": { closeAria: "关闭{{label}}", openAria: "打开{{label}}", sidebarLabel: "导航菜单", asideLabel: "资源面板" },
	en: {
		closeAria: "Close {{label}}",
		openAria: "Open {{label}}",
		sidebarLabel: "Navigation menu",
		asideLabel: "Resource panel",
	},
};

export default layoutStrings;
export { layoutStrings };
