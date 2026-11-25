#!/usr/bin/env node
/** Vue 双跑隔离：删掉上一轮 .scratch/web-vue-e2e 的 mock catalog/会话索引。 */
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

rmSync(join(dirname(fileURLToPath(import.meta.url)), "../../..", ".scratch/web-vue-e2e"), {
	recursive: true,
	force: true,
});
