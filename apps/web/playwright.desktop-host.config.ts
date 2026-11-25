import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const apiBaseUrl = "http://localhost:8802";

/**
 * 桌面壳桥双跑：注入 __OPENAGENTPACK_KIT_BRIDGE__ 模拟原生壳接管 pickFiles/saveFile/copyText/主题，
 * React 与 Vue 依次跑同一组断言（不需要真实原生壳，浏览器里即可验证注入契约的接线）。
 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "desktop-host.experience.spec.ts",
	timeout: 90_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	outputDir: `${root}/.scratch/desktop-host-ui/output`,
	use: { ...devices["Desktop Chrome"], channel: "chrome", locale: "zh-CN", trace: "off" },
	projects: [
		{
			name: "react",
			use: { ...devices["Desktop Chrome"], channel: "chrome", locale: "zh-CN", baseURL: apiBaseUrl },
			metadata: { webUrl: "http://localhost:5223" },
		},
		{
			name: "vue",
			use: { ...devices["Desktop Chrome"], channel: "chrome", locale: "zh-CN", baseURL: apiBaseUrl },
			metadata: { webUrl: "http://localhost:5225" },
		},
	],
	webServer: [
		{
			command: "node apps/server/dist/bin.js",
			cwd: root,
			url: "http://localhost:8802/healthz",
			timeout: 30_000,
			reuseExistingServer: false,
			env: {
				KIT_GATEWAY: "mock",
				KIT_AUTH_MODE: "anonymous",
				ADMIN_TOKEN: "e2e-token",
				KIT_RATE_LIMIT_RPS: "100",
				KIT_RATE_LIMIT_BURST: "200",
				KIT_DATA_DIR: `${root}/.scratch/desktop-host-ui/data-${process.pid}-${Date.now()}`,
				PORT: "8802",
				KIT_CORS_ORIGINS: "http://localhost:5223,http://localhost:5225",
			},
		},
		{
			command: "pnpm --filter web exec vite --port 5223 --strictPort",
			cwd: root,
			url: "http://localhost:5223",
			timeout: 60_000,
			reuseExistingServer: false,
		},
		{
			command: "pnpm --filter web-vue exec vite --port 5225 --strictPort",
			cwd: root,
			url: "http://localhost:5225",
			timeout: 60_000,
			reuseExistingServer: false,
		},
	],
});
