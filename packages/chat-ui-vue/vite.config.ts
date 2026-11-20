import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [vue()],
	build: {
		lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
		// 库形态：运行时依赖全部外部化，由使用方按 package.json 安装，避免把 mermaid 打进 dist。
		rollupOptions: { external: (id) => !id.startsWith(".") && !id.startsWith("/") },
		sourcemap: true,
	},
});
