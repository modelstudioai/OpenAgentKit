/** operations 命名空间：操作日志页与审计动作名。 */
export default {
	title: "操作日志",
	note: "仅记录当前管理员对智能体的新建、编辑、删除、上架、下架及员工端品牌配置的修改。",
	loadFailed: "操作日志加载失败",
	retry: "重试",
	empty: "暂无操作记录",
	total: "共 {{total}} 条操作记录",
	globalTarget: "全局配置",
	version: "配置版本 v{{version}}",
	columns: {
		at: "操作时间",
		action: "操作",
		target: "操作对象",
	},
	actions: {
		create: "新建智能体",
		update: "编辑智能体",
		delete: "删除智能体",
		listing: "上架智能体",
		unlist: "下架智能体",
		brandingUpdate: "更新品牌配置",
	},
};
