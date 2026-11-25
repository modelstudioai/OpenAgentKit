import { Step, Steps } from "fumadocs-ui/components/steps";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ComponentProps } from "react";
import { Preview } from "../components/preview.tsx";
import { Showcase } from "../components/showcase.tsx";
import { withBasePath } from "./base-path.ts";

function DocumentationLink(props: ComponentProps<"a">) {
	if (props.href?.startsWith("/skills/")) {
		// 静态 Skill 文件不是 Next 路由，避免客户端导航与无效的 RSC 预取。
		return (
			<a
				{...props}
				href={withBasePath(props.href)}
				download={props.download ?? (props.href.endsWith(".tgz") ? true : undefined)}
			/>
		);
	}
	return <defaultMdxComponents.a {...props} />;
}

const DefaultImage = defaultMdxComponents.img;

function DocumentationImage(props: ComponentProps<"img">) {
	const src = typeof props.src === "string" ? withBasePath(props.src) : props.src;
	return <DefaultImage {...props} src={src} />;
}

/**
 * MDX 可用组件表。
 *
 * fumadocs-mdx 15 不读 Next 的 `mdx-components.tsx` 约定文件，所以在渲染 MDX body 时显式传入
 * （`app/docs/[[...slug]]/page.tsx` 里的 `<MDX components={mdxComponents} />`）。
 * `defaultMdxComponents` 提供 a/img/table/h1-h6 与 Callout/Card 等基础覆盖，必须保留，
 * 否则文档页会退回浏览器默认样式。
 */
export const mdxComponents = {
	...defaultMdxComponents,
	a: DocumentationLink,
	img: DocumentationImage,
	// 默认表里没有 Steps/Step（fumadocs-ui/mdx 只导出 Card/Calls 等），流程类文档需要它
	Steps,
	Step,
	Preview,
	Showcase,
};
