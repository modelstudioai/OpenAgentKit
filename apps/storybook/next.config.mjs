import { createMDX } from "fumadocs-mdx/next";

/** GitHub Pages 项目站点由 workflow 注入子路径；本地开发与根路径部署保持空串。 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/**
 * 文档站为纯静态产物：Next 静态导出（out/）。
 * 约束：不使用 server actions / 动态路由；首页用 meta refresh 而非 redirect()。
 */
export default createMDX()({
	basePath,
	reactStrictMode: true,
	// next upgrade --agent=security 协议要求：标记本应用的安全升级通道
	experimental: { agentUpgrade: "security" },
	output: "export",
	trailingSlash: true,
	images: { unoptimized: true },
});
