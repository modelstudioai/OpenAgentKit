/** 公共命名空间：阶段 0 仅语言切换器自身；业务文案按 feature 命名空间渐进补充（方案 §5）。 */
export default {
	languageSwitcher: {
		label: "界面语言",
		zh: "中文",
		en: "English",
	},
	metrics: {
		inputTokens: "输入 Token",
		outputTokens: "输出 Token",
		cacheRead: "缓存读取 Token",
		cacheWrite: "缓存写入 Token",
		activeSeconds: "执行时长（秒）",
		durationSeconds: "会话时长（秒）",
	},
	collection: {
		pending: "待获取",
		complete: "已采集",
		partial: "部分缺失",
		failed: "采集失败",
		notFound: "远端会话不存在",
		partialSuffix: "（部分缺失）",
		coverage: "覆盖 {{covered}} / {{total}} 个会话",
		notReturned: "未返回",
	},
};
