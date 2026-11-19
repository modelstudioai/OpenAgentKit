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
	statPending: "待获取",
	back: "返回",
	runtime: {
		configReadFailed: "无法读取服务配置",
		adminNotReady: "管理端尚未完成服务配置初始化",
		invalidBaseUrl: "管理端服务地址必须是无凭据、查询参数和片段的 HTTP(S) 地址",
		missingRouterContext: "缺少管理端路由上下文",
		missingTemplateExitContext: "缺少模版退出确认上下文",
	},
	footnote: {
		agentAssets: "智能体资产用于创建、编辑和调试模版，智能体管理提供上架与下架操作。",
	},
};
