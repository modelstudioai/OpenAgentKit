import type { KitStringTable } from "../kit-i18n/index.ts";

export interface MermaidStrings {
	header: string;
	chart: string;
	source: string;
	copySource: string;
	resourceNotice: string;
	streamingNotice: string;
	renderError: string;
	rerender: string;
	rendering: string;
}

const mermaidStrings: KitStringTable<MermaidStrings> = {
	"zh-CN": {
		header: "Mermaid 图表",
		chart: "图表",
		source: "源码",
		copySource: "复制图表源码",
		resourceNotice: "图片节点、嵌入资源及扩展节点语法仅显示源码。",
		streamingNotice: "图表生成中，先显示源码。",
		renderError: "图表暂时无法渲染，请检查源码。",
		rerender: "重新渲染",
		rendering: "正在渲染图表…",
	},
	en: {
		header: "Mermaid diagram",
		chart: "Diagram",
		source: "Source",
		copySource: "Copy diagram source",
		resourceNotice: "Image nodes, embedded resources, and extended node syntax are shown as source only.",
		streamingNotice: "The diagram is being generated; the source is shown first.",
		renderError: "The diagram cannot be rendered right now; check the source.",
		rerender: "Rerender",
		rendering: "Rendering diagram…",
	},
};

export default mermaidStrings;
export { mermaidStrings };
