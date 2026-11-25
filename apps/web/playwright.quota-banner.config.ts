import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const apiBaseUrl = "http://localhost:8801";

/**
 * 真实配额横幅双跑：成员模式 + mock gateway，由服务端限额闸门产生真实 403，
 * 同一份数据依次在 React 与 Vue 体验页跑同一条流程（不需要 console，限额走管理接口）。
 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "quota-banner.experience.spec.ts",
	timeout: 90_000,
	expect: { timeout: 15_000 },
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	outputDir: `${root}/.scratch/quota-banner-ui/output`,
	use: { ...devices["Desktop Chrome"], baseURL: apiBaseUrl, channel: "chrome", locale: "zh-CN", trace: "off" },
	projects: [
		{
			name: "react",
			use: { ...devices["Desktop Chrome"], baseURL: apiBaseUrl, channel: "chrome", locale: "zh-CN" },
			metadata: { webUrl: "http://localhost:5213", apiBaseUrl },
		},
		{
			name: "vue",
			use: { ...devices["Desktop Chrome"], baseURL: apiBaseUrl, channel: "chrome", locale: "zh-CN" },
			metadata: { webUrl: "http://localhost:5215", apiBaseUrl },
		},
	],
	webServer: [
		{
			command: "pnpm --filter @openagentpack/kit-server exec tsx src/bin.ts",
			cwd: root,
			url: `${apiBaseUrl}/healthz`,
			timeout: 30_000,
			reuseExistingServer: false,
			env: {
				KIT_GATEWAY: "mock",
				KIT_AUTH_MODE: "member",
				ADMIN_TOKEN: "e2e-token",
				KIT_DATA_DIR: `${root}/.scratch/quota-banner-ui/data-${process.pid}-${Date.now()}`,
				PORT: "8801",
				KIT_CORS_ORIGINS: "http://localhost:5213,http://localhost:5215",
			},
		},
		{
			command: "pnpm --filter web exec vite --port 5213 --strictPort",
			cwd: root,
			url: "http://localhost:5213",
			timeout: 60_000,
			reuseExistingServer: false,
		},
		{
			command: "pnpm --filter web-vue exec vite --port 5215 --strictPort",
			cwd: root,
			url: "http://localhost:5215",
			timeout: 60_000,
			reuseExistingServer: false,
		},
	],
});
