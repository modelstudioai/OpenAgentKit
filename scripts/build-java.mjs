import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadJavaToolchain } from "../apps/server-java/toolchain.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function run(command, args, env) {
	const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
	if (result.error) throw new Error(`无法运行 ${command}，请核对本地构建工具`);
	if (result.status !== 0) throw new Error(`${command} 构建失败`);
}

try {
	const { env } = loadJavaToolchain(root);
	if (!process.argv.includes("--jar-only")) run("pnpm", ["--filter", "@openagentpack/kit-server...", "build"], env);
	run(env.KIT_MAVEN || "mvn", ["-B", "-ntp", "-f", "apps/server-java/pom.xml", "verify"], env);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
