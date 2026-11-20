import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./src/main/java/org/openagentkit/server/", import.meta.url));
const namespace = "org.openagentkit.server.";
const dependencies = {
	controller: ["service", "support"],
	service: ["dao", "support"],
	dao: ["store", "support"],
	store: ["support"],
	support: [],
};
const servlet =
	/^(?:javax\.servlet\.|jakarta\.servlet\.|org\.springframework\.web\.(?:bind|filter|multipart|server|servlet)\.)/;
const jdbc = /^(?:java\.sql\.|org\.springframework\.jdbc\.)/;

export async function checkLayers() {
	for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".java")) continue;
		const source = join(entry.parentPath, entry.name);
		const path = relative(root, source);
		const [layer] = path.split(sep);
		if (layer === "http") throw new Error(`${path} 应按职责归入 Java 服务端分层`);
		if (!Object.hasOwn(dependencies, layer)) continue;
		const contents = await readFile(source, "utf8");
		for (const [, name] of contents.matchAll(/^\s*import\s+(?:static\s+)?([\w.*]+)\s*;/gm)) {
			if (allowed(layer, name)) continue;
			throw new Error(`${path} 的分层不允许导入 ${name}`);
		}
	}
}

function allowed(layer, name) {
	if (layer !== "controller" && servlet.test(name)) return false;
	if (layer !== "store" && jdbc.test(name)) return false;
	if (layer === "controller" && name === `${namespace}GatewayClient`) return false;
	if (layer === "service" && name === "org.springframework.http.ResponseEntity") return false;
	if (!name.startsWith(namespace)) return true;
	const [target] = name.slice(namespace.length).split(".");
	if (target === "http") return false;
	// Row 只包含记录值与类型转换，由 DAO 返回。
	if (layer === "service" && name === `${namespace}store.KitDatabase.Row`) return true;
	return !Object.hasOwn(dependencies, target) || target === layer || dependencies[layer].includes(target);
}
