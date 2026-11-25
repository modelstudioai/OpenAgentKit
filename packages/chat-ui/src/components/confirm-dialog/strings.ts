import type { KitStringTable } from "../kit-i18n/index.ts";

export interface ConfirmDialogStrings {
	confirm: string;
	cancel: string;
}

const confirmDialogStrings: KitStringTable<ConfirmDialogStrings> = {
	"zh-CN": { confirm: "确认", cancel: "取消" },
	en: { confirm: "Confirm", cancel: "Cancel" },
};

export default confirmDialogStrings;
export { confirmDialogStrings };
