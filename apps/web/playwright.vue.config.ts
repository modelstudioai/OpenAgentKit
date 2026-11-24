import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const webVueDir = fileURLToPath(new URL("../web-vue", import.meta.url));
const channel = (process.env.KIT_E2E_CHANNEL || "chrome") as "chrome" | "chromium";

/** Vue 体验页双跑：复用 React 的 experience.spec，仅替换前端与端口。 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: /(^|\/)(experience|vue-anchor|browser-notification\.experience)\.spec\.ts$/,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	use: { baseURL: "http://localhost:5175", locale: "zh-CN", trace: "on-first-retry" },
	grep: /体验外壳|品牌 Logo|浏览器通知|Shift\+Enter |首屏 → 发送|回答复制|反馈富内容|点击示例问题|斜杠技能|切换 Agent|侧栏分区|断网一次|会话归档与删除|工具审批|消息锚点|附件：上传暂存/,
	projects: [{ name: "vue-desktop", use: { ...devices["Desktop Chrome"], channel } }],
	webServer: [
		{
			command: "node apps/server/dist/bin.js",
			cwd: root,
			url: "http://localhost:8787/healthz",
			timeout: 30_000,
			env: {
				KIT_GATEWAY: "mock",
				KIT_AUTH_MODE: "anonymous",
				ADMIN_TOKEN: "e2e-token",
				KIT_ADMIN_TOKENS: "e2e-auditor:auditor",
				KIT_RATE_LIMIT_RPS: "100",
				KIT_RATE_LIMIT_BURST: "200",
				KIT_DATA_DIR: `${root}/.scratch/web-vue-e2e`,
				PORT: "8787",
				KIT_CORS_ORIGINS: "http://localhost:5175",
			},
		},
		{
			command: "node node_modules/vite/bin/vite.js --host 127.0.0.1",
			cwd: webVueDir,
			url: "http://localhost:5175",
			timeout: 60_000,
			reuseExistingServer: false,
		},
	],
});
