/** catalog 命名空间：展示字段表单、记忆库/密钥库校验、远端资源选择器。 */
export default {
	agentPresentation: {
		descriptionMax: "描述最多 400 个字符",
		openingMax: "开场白最多 2000 个字符",
		promptsMax: "示例问题最多 8 条",
		promptMax: "每条示例问题最多 200 个字符",
		description: "描述",
		opening: "开场白",
		prompts: "示例问题",
		addPrompt: "添加示例问题",
		add: "添加",
		hint: "最多 {{max}} 条，每条最多 200 个字符。",
		promptAria: "示例问题 {{index}}",
		removePrompt: "移除示例问题 {{index}}",
		promptPlaceholder: "输入示例问题",
		ok: "确定",
		cancel: "取消",
	},
	memory: {
		max: "最多添加 {{max}} 个记忆库",
		choose: "第 {{index}} 个记忆请选择记忆库",
		duplicate: "同一个记忆库只能选择一次",
		access: "第 {{index}} 个记忆请选择有效权限",
		instructions: "第 {{index}} 个记忆的说明不能超过 {{max}} 字符",
	},
	vault: {
		max: "最多选择 {{max}} 个密钥库",
		invalid: "请选择有效的密钥库",
		duplicate: "同一个密钥库只能选择一次",
	},
	picker: {
		loading: "正在加载{{noun}}…",
		noMatch: "未找到匹配的{{noun}}",
		empty: "暂无远端{{noun}}",
	},
	retry: "重试",
	plazaCategory: "广场分类",
};
