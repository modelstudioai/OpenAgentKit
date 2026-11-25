import type { KitStringTable } from "../kit-i18n/index.ts";

export interface MeterBarStrings {
	unlimited: string;
	used: string;
}

const meterBarStrings: KitStringTable<MeterBarStrings> = {
	"zh-CN": { unlimited: "不限量", used: "已用 {{value}} / {{max}}" },
	en: { unlimited: "Unlimited", used: "{{value}} of {{max}} used" },
};

export default meterBarStrings;
export { meterBarStrings };
