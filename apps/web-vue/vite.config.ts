import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [vue(), tailwindcss()],
	server: {
		port: 5175,
		// 固定端口：E2E 的 baseURL 依赖它，不能被 Vite 自动改成 5176。
		strictPort: true,
		proxy: { "/api": "http://localhost:8787" },
	},
	build: { outDir: "dist", sourcemap: true },
});
