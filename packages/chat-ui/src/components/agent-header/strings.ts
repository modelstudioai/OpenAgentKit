import type { KitStringTable } from "../kit-i18n/index.ts";

export interface AgentHeaderStrings {
	noAgent: string;
	switchAgent: string;
	newSession: string;
}

const agentHeaderStrings: KitStringTable<AgentHeaderStrings> = {
	"zh-CN": { noAgent: "未选择 Agent", switchAgent: "切换 Agent", newSession: "新会话" },
	en: { noAgent: "No agent selected", switchAgent: "Switch agent", newSession: "New session" },
};

export default agentHeaderStrings;
export { agentHeaderStrings };
