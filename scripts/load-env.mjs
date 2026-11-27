/**
 * 启动时只解析一个模式文件。旧 `.env` 只在缺文件时按原字节复制一次，之后不再打开。
 * 使用 dotenv.parse，不调用 dotenv.config()，避免空字符串清掉 shell 中已有的值。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";

const MODES = ["development", "production"];
const BAILIAN_ADDRESS_KEYS = ["BAILIAN_BASE_URL", "BAILIAN_WORKSPACE_ID"];

/** 用 dotenv 的解析结果检查往返，避免 #、空格或引号改变凭据内容。 */
export function encodeEnvValue(value) {
	return [value, `'${value}'`, `"${value}"`, `\`${value}\``].find(
		(candidate) => parse(`VALUE=${candidate}`).VALUE === value,
	);
}

export function requestedKitEnv(env = process.env) {
	return env.KIT_ENV?.trim() || "";
}

export function resolveMode(defaultMode, env = process.env) {
	const requested = requestedKitEnv(env) || defaultMode;
	if (!MODES.includes(requested)) {
		throw new Error(`KIT_ENV 只接受 development 或 production，当前为 ${requested}。`);
	}
	return requested;
}

/** 缺哪个模式文件就复制哪个；已存在的文件保持原字节，不合并、不覆盖、不删除 `.env`。 */
export function migrateLegacyEnv(root) {
	const missing = MODES.map((mode) => `.env.${mode}`).filter((name) => !existsSync(join(root, name)));
	if (missing.length === 0) return [];
	const source = join(root, ".env");
	if (!existsSync(source)) return [];
	const bytes = readFileSync(source);
	const created = [];
	for (const name of missing) {
		try {
			writeFileSync(join(root, name), bytes, { flag: "wx", mode: 0o600 });
			created.push(name);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
	}
	return created;
}

function applyLocalEnv(base, local) {
	const env = { ...base };
	const overridden = [];
	const hasLocalBailianAddress = BAILIAN_ADDRESS_KEYS.some((key) => local[key]?.trim());
	for (const [key, value] of Object.entries(local)) {
		if (!value && !(hasLocalBailianAddress && BAILIAN_ADDRESS_KEYS.includes(key))) continue;
		if (key in env && env[key] !== value) overridden.push(key);
		env[key] = value;
	}
	return { env, overridden };
}

function resolveRepoPaths(root, env) {
	// 相对路径只相对仓库根解析一次。未设置时用仓库根 .data，避免换到 apps/server 后数据落到包目录。
	const dataDir = env.KIT_DATA_DIR?.trim();
	if (!dataDir) env.KIT_DATA_DIR = join(root, ".data");
	else if (!dataDir.startsWith("/")) env.KIT_DATA_DIR = join(root, dataDir);
	if (env.KIT_EVAL_WORKSPACES) {
		env.KIT_EVAL_WORKSPACES = env.KIT_EVAL_WORKSPACES.split(",")
			.map((segment) => segment.trim())
			.filter(Boolean)
			.map((segment) => (segment.startsWith("/") ? segment : join(root, segment)))
			.join(",");
	}
}

export function loadLocalEnv({ root, defaultMode, env: source = process.env, log = console.log, migrate = true }) {
	const mode = resolveMode(defaultMode, source);
	const created = migrate ? migrateLegacyEnv(root) : [];
	const filename = `.env.${mode}`;
	const file = join(root, filename);
	const present = existsSync(file);
	const local = present ? parse(readFileSync(file, "utf8")) : {};
	const { env, overridden } = applyLocalEnv(source, local);
	resolveRepoPaths(root, env);
	env.KIT_ENV_LOADED = "1";
	if (created.length) log(`[env] 已从 .env 复制到 ${created.join("、")}。`);
	if (overridden.length) log(`[env] ${filename} 覆盖了 shell 同名变量：${overridden.join(", ")}`);
	return { env, mode, created, overridden, filename: present ? filename : null };
}
