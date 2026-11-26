import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { generateOpenApi } from "./http/openapi.ts";
import { routeControllers } from "./module/http-controllers.ts";

function readDocument(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

const path = join(process.cwd(), "openapi.json");
const document = generateOpenApi(routeControllers);
// 同一合同保留既有键顺序，避免路由装配顺序影响生成物。
if (!isDeepStrictEqual(readDocument(path), document)) {
	writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
}
console.warn(`openapi.json verified (${Object.keys(document.paths).length} paths)`);
