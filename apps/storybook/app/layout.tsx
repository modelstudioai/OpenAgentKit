import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteProvider } from "../components/site-provider.tsx";
import { basePath } from "../lib/base-path.ts";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "OpenAgentPack Kit",
		template: "%s · OpenAgentPack Kit",
	},
	description: "为百炼 Managed Agent 打造体验页的开发套件：协议、hooks、copy-in 组件、Node server 与管理端。",
};

/** 首屏绘制前按去掉部署前缀的路由决定首页暗色、预览继承、其余页面亮色。 */
const themeScript = `(function(){try{var b=${JSON.stringify(basePath)};var n=location.pathname;if(b&&(n===b||n.indexOf(b+'/')===0))n=n.slice(b.length)||'/';var p=n.indexOf('/previews/')===0;var d=p?localStorage.getItem('theme')==='dark':n==='/';var t=d?'dark':'light';if(p)document.documentElement.dataset.kitTheme=t;else localStorage.setItem('theme',t);var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);}catch(e){}})();`;

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="zh-CN" suppressHydrationWarning>
			<body className="flex flex-col min-h-screen">
				<script>{themeScript}</script>
				<SiteProvider>{children}</SiteProvider>
			</body>
		</html>
	);
}
