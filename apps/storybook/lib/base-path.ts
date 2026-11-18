/**
 * GitHub Pages 项目站点部署在 `/OpenAgentPack-Kit` 这类子路径时，由构建环境注入。
 * 本地开发与根路径部署不设置该变量，保持空串。
 */
export const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/**
 * 给原生绝对路径加上部署前缀。
 *
 * Next 的 Link 会自动处理 basePath；iframe、原生 <a>、图片 src 等不会，
 * 统一通过这里处理。相对路径、协议地址和已带前缀的路径保持不变。
 */
export function withBasePath(path: string): string {
	if (!path.startsWith("/") || path.startsWith("//")) return path;
	if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) return path;
	return `${basePath}${path}`;
}

/**
 * 去掉 `usePathname()` / `location.pathname` 可能携带的部署前缀。
 * 用于首页、`/previews/**` 等基于路由的判断。
 */
export function stripBasePath(pathname: string): string {
	if (!basePath) return pathname;
	if (pathname === basePath) return "/";
	if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
	return pathname;
}
