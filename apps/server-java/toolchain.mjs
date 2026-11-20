import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { parseEnv } from "node:util";

const keys = ["JAVA_HOME", "KIT_MAVEN", "MAVEN_OPTS", "KIT_JAVA_NODE"];

export function loadJavaToolchain(root, baseEnv = process.env) {
	const env = { ...baseEnv };
	const profile = join(root, ".scratch", "java-toolchain.env");
	if (existsSync(profile)) {
		const local = parseEnv(readFileSync(profile, "utf8"));
		for (const key of keys) {
			if (!env[key] && local[key]) env[key] = local[key];
		}
	}

	const node = env.KIT_JAVA_NODE || process.execPath;
	if (!isAbsolute(node)) throw new Error("KIT_JAVA_NODE 需要 Node.js 可执行文件的绝对路径");
	const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
	env[pathKey] = [dirname(node), env[pathKey]].filter(Boolean).join(delimiter);

	const version =
		node === process.execPath
			? process.version
			: spawnSync(node, ["--version"], { env, encoding: "utf8" }).stdout?.trim();
	if (!version) throw new Error("无法运行 KIT_JAVA_NODE 指定的 Node.js，请检查 Java 工具链配置");
	const major = Number(/^v(\d+)\./.exec(version)?.[1] ?? 0);
	if (major < 24) throw new Error(`Kit Java 工具链需要 Node.js 24 或更新版本，当前为 ${version}`);

	return { env, node };
}
