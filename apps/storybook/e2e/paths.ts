/**
 * Playwright 的 baseURL 可能是根路径，也可能是 GitHub Pages 的 `/OpenAgentKit/`。
 * 统一用相对地址导航，避免 page.goto 的前导斜杠绕过 baseURL 的子路径。
 */
export function sitePath(pathname: string): string {
	return pathname === "/" ? "./" : pathname.replace(/^\/+/, "");
}

/** iframe src 部署后会带 basePath；用后缀匹配，测试不绑定具体部署前缀。 */
export function previewFrame(name: string): string {
	return `iframe[src$="/previews/${name}/"]`;
}
