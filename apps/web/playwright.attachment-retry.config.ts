import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const apiBaseUrl = "http://localhost:8805";

/** 附件挂载与 409 重试双跑：同一份服务端状态，React 与 Vue 依次跑同一条竞态流程。 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "attachment-retry.experience.spec.ts",
	timeout: 90_000,
	expect: { timeout: 20_000 },
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	outputDir: `${root}/.scratch/attachment-retry-ui/output`,
	use: { ...devices["Desktop Chrome"], channel: "chrome", locale: "zh-CN", trace: "off" },
	projects: [
		{
			name: "react",
			use: { ...devices["Desktop Chrome"], channel: "chrome", locale: "zh-CN", baseURL: apiBaseUrl },
			metadata: { webUrl: "http://localhost:5243" },
		},
		{
			name: "vue",
			use: { ...devices["Desktop Chrome"], channel: "chrome", locale: "zh-CN", baseURL: apiBaseUrl },
			metadata: { webUrl: "http://localhost:5245" },
		},
	],
	webServer: [
		{
			command: "node apps/server/dist/bin.js",
			cwd: root,
			url: `${apiBaseUrl}/healthz`,
			timeout: 30_000,
			reuseExistingServer: false,
			env: {
				KIT_GATEWAY: "mock",
				KIT_AUTH_MODE: "anonymous",
				ADMIN_TOKEN: "e2e-token",
				KIT_RATE_LIMIT_RPS: "100",
				KIT_RATE_LIMIT_BURST: "200",
				KIT_DATA_DIR: `${root}/.scratch/attachment-retry-ui/data-${process.pid}-${Date.now()}`,
				PORT: "8805",
				KIT_CORS_ORIGINS: "http://localhost:5243,http://localhost:5245",
			},
		},
		{
			command: "pnpm --filter web exec vite --port 5243 --strictPort",
			cwd: root,
			url: "http://localhost:5243",
			timeout: 60_000,
			reuseExistingServer: false,
		},
		{
			command: "pnpm --filter web-vue exec vite --port 5245 --strictPort",
			cwd: root,
			url: "http://localhost:5245",
			timeout: 60_000,
			reuseExistingServer: false,
		},
	],
});
