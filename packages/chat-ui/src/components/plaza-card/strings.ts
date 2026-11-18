import type { KitStringTable } from "../kit-i18n/index.ts";

/** PlazaCard 文案键；分类名走服务端数据（PLAZA_CATEGORY_LABELS 为协议词汇，另行收敛）。 */
export interface PlazaCardStrings {
	capabilities: {
		streaming: string;
		fileUpload: string;
		artifacts: string;
		threads: string;
		reasoning: string;
	};
	usedToday: string;
	usedYesterday: string;
	usedDaysAgo: string;
	featured: string;
	mine: string;
	noDescription: string;
	tryAsk: string;
	turns30dPrefix: string;
	turns30dSuffix: string;
	start: string;
}

const plazaCardStrings: KitStringTable<PlazaCardStrings> = {
	"zh-CN": {
		capabilities: {
			streaming: "流式输出",
			fileUpload: "文件上传",
			artifacts: "产物",
			threads: "多会话",
			reasoning: "深度思考",
		},
		usedToday: "今天使用过",
		usedYesterday: "昨天使用过",
		usedDaysAgo: "{{days}} 天前使用过",
		featured: "精选",
		mine: "我的",
		noDescription: "暂无描述",
		tryAsk: "试试问：「{{prompt}}」",
		turns30dPrefix: "近 30 天",
		turns30dSuffix: "次",
		start: "开始体验",
	},
	en: {
		capabilities: {
			streaming: "Streaming",
			fileUpload: "File upload",
			artifacts: "Artifacts",
			threads: "Multi-session",
			reasoning: "Deep reasoning",
		},
		usedToday: "Used today",
		usedYesterday: "Used yesterday",
		usedDaysAgo: "Used {{days}} days ago",
		featured: "Featured",
		mine: "Mine",
		noDescription: "No description yet",
		tryAsk: 'Try asking: "{{prompt}}"',
		turns30dPrefix: "Used",
		turns30dSuffix: "times in the last 30 days",
		start: "Try now",
	},
};

export default plazaCardStrings;
export { plazaCardStrings };
