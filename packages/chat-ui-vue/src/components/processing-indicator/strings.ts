import type { KitStringTable } from "../kit-i18n/index.ts";

/** ProcessingIndicator 文案键；与 StatusIndicator 的 running 对齐。 */
export interface ProcessingIndicatorStrings {
	processing: string;
}

const processingIndicatorStrings: KitStringTable<ProcessingIndicatorStrings> = {
	"zh-CN": { processing: "生成中…" },
	en: { processing: "Generating…" },
};

export default processingIndicatorStrings;
export { processingIndicatorStrings };
