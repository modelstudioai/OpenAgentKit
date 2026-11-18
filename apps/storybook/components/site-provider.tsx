"use client";

import { RootProvider } from "fumadocs-ui/provider/next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { stripBasePath, withBasePath } from "../lib/base-path.ts";
import { zhCN } from "../lib/i18n.ts";

export function SiteProvider({ children }: { children: ReactNode }) {
	const isPreview = stripBasePath(usePathname()).startsWith("/previews/");

	return (
		<RootProvider
			theme={{ hotKey: false }}
			i18n={{ locale: "zh-CN", translations: zhCN }}
			search={{
				enabled: !isPreview,
				options: { type: "static", api: withBasePath("/api/search.json") },
			}}
		>
			{children}
		</RootProvider>
	);
}
