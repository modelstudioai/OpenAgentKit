import { spawnSync } from "node:child_process";

// 生成器与服务分开加载，确保服务读取本次新登记的版本和三库产物。
const generation = spawnSync(process.execPath, ["--import", "tsx", "src/store/migrations/generate.ts", "--auto"], {
	stdio: "inherit",
});
if (generation.error) throw generation.error;
if (generation.status === 0) await import("../src/bin.ts");
else process.exitCode = generation.status ?? 1;
