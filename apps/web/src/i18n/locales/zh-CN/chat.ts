/** chat 命名空间：会话页头、确认弹窗、附件与输入框。 */
export default {
	untitledSession: "未命名会话",
	newSession: "新会话",
	header: {
		asideLabel: "资源面板",
		asideTrigger: "资源",
		backToPlaza: "返回广场",
		asideCollapse: "收起资源面板",
		asideExpand: "展开资源面板",
		closeError: "关闭错误提示",
	},
	sessionDialog: {
		archiveTitle: "归档会话",
		deleteTitle: "删除会话",
		processing: "处理中…",
		confirm: "确认",
		refetchPlan: "重新获取计划",
		archiveEffect: "归档后会话不再接受新消息，历史仍可在 Provider 侧查询。",
		deleteEffect:
			"将先停止正在运行的执行，并保存成员会话的最新用量快照。成功后才删除会话，消息不可恢复；用量统计保留。停止或保存失败时会话保留，可重试。",
		busyNote: "正在处理，请稍候…",
		planning: "正在获取操作计划…",
	},
	attachment: {
		scanTimeout: "扫描超时，请移除后重试",
		scanning: "安全扫描中…",
	},
	errors: {
		sendFailed: "消息发送失败：{{message}}",
		previewFailed: "文件预览失败",
		downloadFailed: "文件下载失败",
		copyFailed: "复制失败",
	},
	noAgents: {
		title: "还没有上架的 Agent",
		hint: "到管理端完成 publish 与上架后，这里就会出现可对话的角色。",
	},
	emptyChat: {
		chatWith: "和 {{name}} 聊聊",
		hint: "选择下面任一示例，或直接输入你的问题",
	},
	aside: {
		agentInfo: "Agent 信息",
		artifacts: "产物",
		artifactsEmpty: "发送消息后，生成的文件与图表会出现在这里",
		openFile: "打开 {{name}}",
		downloadFile: "下载 {{name}}",
		download: "下载",
		permissions: {
			allow: "总是允许",
			ask: "每次询问",
		},
		resources: {
			skillsMcp: "技能与 MCP",
			tools: "工具",
			memory: "记忆库",
		},
	},
	sender: {
		attachmentNote: "发送时会一并提交附件",
		placeholderMobile: "输入消息…",
		sendingSr: "发送中",
		addAttachment: "添加附件",
		attachments: "附件",
		uploadImage: "上传图片",
		uploadVideo: "上传视频",
		uploadFile: "上传文件",
	},
	recent: "最近使用",
};
