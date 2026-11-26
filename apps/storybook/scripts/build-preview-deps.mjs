import { execFileSync } from "node:child_process";

// Turbo 的 ^build 已准备好预览依赖。再次构建会清空其他应用正在读取的 SDK dist。
if (!process.env.TURBO_HASH) {
	execFileSync("pnpm", ["--filter", "@openagentpack/kit-chat-ui...", "build"], {
		shell: process.platform === "win32",
		stdio: "inherit",
	});
}
