import type { VNode } from "vue";

/** 把只含文本的默认插槽还原成字符串；用于与 React 的 `children: string` 对齐。 */
export function slotText(vnodes: VNode[] | undefined): string {
	if (!vnodes?.length) return "";
	let text = "";
	for (const node of vnodes) {
		if (typeof node.children === "string") text += node.children;
		else if (Array.isArray(node.children)) text += slotText(node.children as VNode[]);
	}
	return text;
}
