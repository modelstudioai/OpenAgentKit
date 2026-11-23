import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

// SHA-256 来自 Keycloak 和 Eclipse Temurin 的 GitHub Release 资产清单。
const keycloakVersion = "26.8.2";
const keycloakDistribution = {
	name: `keycloak-${keycloakVersion}`,
	url: `https://github.com/keycloak/keycloak/releases/download/${keycloakVersion}/keycloak-${keycloakVersion}.tar.gz`,
	sha256: "dd124787283918bc597628887168333465ee2a811a389e0003569e52be7e487f",
	executable: "bin/kc.sh",
};

const javaVersion = "21.0.12.1";
const javaBuild = 1;
const javaAssets = {
	"darwin-arm64": ["aarch64_mac", "dec50fc6f9fcd4fe3ae8cabf5a5fa68f6afc48841f7698e468e9aa5d54beed84"],
	"darwin-x64": ["x64_mac", "6717ec641fd9ce0bb209ca083ee23b42202ac68cb6fcc5753496e0e4a0f41989"],
	"linux-arm64": ["aarch64_linux", "14be1f35ebdbd1f6e8d57eb911a3ffb74d6d9aa255abc5daf2b1302002cf2cf2"],
	"linux-x64": ["x64_linux", "2413149700df0f7d440500a84a8f764c535f21e5a5e87d38328b64eec2c5b500"],
};

async function installDistribution(cache, distribution, { env, signal }) {
	const destination = join(cache, distribution.name);
	const executable = join(destination, distribution.executable);
	if (existsSync(executable)) return destination;

	await mkdir(cache, { mode: 0o700, recursive: true });
	const stage = await mkdtemp(join(cache, ".install-"));
	try {
		const archive = join(stage, "archive.tar.gz");
		const extracted = join(stage, "extracted");
		process.stdout.write(`[keycloak] 下载 ${distribution.name}\n`);
		try {
			await exec(
				"curl",
				[
					"--disable",
					"--fail",
					"--silent",
					"--show-error",
					"--location",
					"--proto",
					"=https",
					"--proto-redir",
					"=https",
					"--retry",
					"2",
					"--connect-timeout",
					"15",
					"--speed-limit",
					"1024",
					"--speed-time",
					"45",
					"--max-time",
					"1200",
					"--output",
					archive,
					distribution.url,
				],
				{ env, signal },
			);
		} catch (error) {
			signal.throwIfAborted();
			const reason = error.code === "ENOENT" ? "请安装 curl" : `请检查 GitHub 下载连接（curl ${error.code}）`;
			throw new Error(`下载 ${distribution.name} 失败。${reason}`);
		}
		const hash = createHash("sha256");
		for await (const chunk of createReadStream(archive, { signal })) hash.update(chunk);
		if (hash.digest("hex") !== distribution.sha256) throw new Error(`${distribution.name} 的 SHA-256 校验失败`);

		await mkdir(extracted, { mode: 0o700 });
		try {
			await exec("tar", ["-xzf", archive, "-C", extracted, "--strip-components=1"], { env, signal });
		} catch {
			signal.throwIfAborted();
			throw new Error(`解压 ${distribution.name} 失败。请检查 tar 和可用磁盘空间`);
		}
		if (!existsSync(join(extracted, distribution.executable))) throw new Error(`${distribution.name} 缺少启动文件`);
		signal.throwIfAborted();
		try {
			await rename(extracted, destination);
		} catch (error) {
			if (!["EEXIST", "ENOTEMPTY"].includes(error.code) || !existsSync(executable)) throw error;
		}
		return destination;
	} finally {
		await rm(stage, { recursive: true, force: true });
	}
}

export async function prepareKeycloakHome(home, cache, options) {
	if (!home) return installDistribution(cache, keycloakDistribution, options);
	if (!existsSync(join(home, "bin/kc.sh"))) throw new Error("KIT_KEYCLOAK_HOME 必须指向包含 bin/kc.sh 的发行包目录");
	return home;
}

function supportsJava(command, env) {
	const result = spawnSync(command, ["-version"], { env, encoding: "utf8", timeout: 5000 });
	const version = Number(`${result.stdout}\n${result.stderr}`.match(/(?:openjdk|java) version "(\d+)/)?.[1]);
	return result.status === 0 && [17, 21, 25].includes(version);
}

export async function prepareKeycloakJava(override, javaHome, cache, options) {
	if (override) {
		if (!supportsJava(join(override, "bin/java"), options.env)) {
			throw new Error("KIT_KEYCLOAK_JAVA_HOME 必须指向可运行的 Java 17、21 或 25");
		}
		return override;
	}
	if (javaHome && supportsJava(join(javaHome, "bin/java"), options.env)) return javaHome;
	if (supportsJava("java", options.env)) return undefined;

	const platform = `${process.platform}-${process.arch}`;
	const asset = javaAssets[platform];
	if (!asset) throw new Error("当前平台需要安装兼容的 Java，或设置 KIT_KEYCLOAK_JAVA_HOME");
	const [target, sha256] = asset;
	const file = `OpenJDK21U-jre_${target}_hotspot_${javaVersion}_${javaBuild}.tar.gz`;
	const javaSubdirectory = process.platform === "darwin" ? "Contents/Home" : ".";
	const home = await installDistribution(
		cache,
		{
			name: `temurin-${javaVersion}-${javaBuild}-${platform}`,
			url: `https://github.com/adoptium/temurin21-binaries/releases/download/jdk-${javaVersion}%2B${javaBuild}/${file}`,
			sha256,
			executable: join(javaSubdirectory, "bin/java"),
		},
		options,
	);
	const installed = join(home, javaSubdirectory);
	if (!supportsJava(join(installed, "bin/java"), options.env)) {
		throw new Error("下载的 Java 无法运行。请为当前系统指定 KIT_KEYCLOAK_JAVA_HOME");
	}
	return installed;
}
