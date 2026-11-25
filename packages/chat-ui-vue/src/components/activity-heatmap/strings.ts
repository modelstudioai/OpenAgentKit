import type { KitStringTable } from "../kit-i18n/index.ts";

export interface ActivityHeatmapStrings {
	empty: string;
	day: string;
	join: string;
	less: string;
	more: string;
}

const activityHeatmapStrings: KitStringTable<ActivityHeatmapStrings> = {
	"zh-CN": { empty: "暂无活跃记录", day: "{{day}}：{{turns}} turns", join: "；", less: "不活跃", more: "活跃" },
	en: { empty: "No activity yet", day: "{{day}}: {{turns}} turns", join: "; ", less: "Less", more: "More" },
};

export default activityHeatmapStrings;
export { activityHeatmapStrings };
