import { env } from "node:process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolveWebDevPort } from "../../scripts/dev-web-port.ts";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		port: resolveWebDevPort(env.KIT_WEB_DEV_PORT),
		strictPort: true,
		proxy: { "/api": "http://localhost:8787" },
	},
	build: { outDir: "dist", sourcemap: true },
});
