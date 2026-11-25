import type { KitStringTable } from "../kit-i18n/index.ts";

export interface ErrorStateStrings {
	heading: string;
	retry: string;
}

const errorStateStrings: KitStringTable<ErrorStateStrings> = {
	"zh-CN": { heading: "出错了", retry: "重试" },
	en: { heading: "Something went wrong", retry: "Retry" },
};

export default errorStateStrings;
export { errorStateStrings };
