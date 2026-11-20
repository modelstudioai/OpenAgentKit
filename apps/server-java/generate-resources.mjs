import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { program as mysql } from "../server/src/store/schema/generated/mysql.ts";
import { program as postgres } from "../server/src/store/schema/generated/postgres.ts";
import { program as sqlite } from "../server/src/store/schema/generated/sqlite.ts";
import { splitSql } from "../server/src/store/schema/model.ts";
import { mysqlTableOptions } from "../server/src/store/schema/render.ts";
import { sqliteHistory } from "../server/src/store/sqlite-history.ts";
import { checkLayers } from "./check-layers.mjs";

const directory = process.argv[2];
if (!directory || Number(process.versions.node.split(".")[0]) < 24) {
	throw new Error("生成 Java Kit 资源需要 Node.js 24 和生成目录");
}

// 冻结的 SQLite 迁移仍在原处。由空库回放提取其中的 SQL，带数据的转换保留显式步骤。
function sqliteProgram() {
	const database = new DatabaseSync(":memory:");
	try {
		const history = sqliteHistory.map(({ id, sql, run }) => {
			if (!run) {
				database.exec(sql);
				return { id, steps: [{ data: splitSql(sql) }] };
			}
			const statements = [];
			run({
				prepare: database.prepare.bind(database),
				exec(source) {
					statements.push(...splitSql(source));
					database.exec(source);
				},
			});
			if (id === "022_usage_limit_days_rebuild") return { id, steps: [{ transform: "rebuildDailyUsage" }] };
			if (id === "031_retire_directory_drafts")
				return { id, steps: [{ data: statements }, { transform: "retireDrafts" }] };
			return { id, steps: [{ addMissingColumns: statements }] };
		});
		return { ...sqlite, history };
	} finally {
		database.close();
	}
}

function migrationFingerprints(program) {
	const versions = [...program.history, ...program.upgrades, ...(program.adoption ? [program.adoption] : [])];
	return Object.fromEntries(
		versions.map(({ id, steps }) => [id, createHash("sha256").update(JSON.stringify(steps)).digest("hex")]),
	);
}

await checkLayers();
await mkdir(join(directory, "kit"), { recursive: true });
await Promise.all([
	copyFile(new URL("../server/openapi.json", import.meta.url), join(directory, "kit/openapi.json")),
	writeFile(
		join(directory, "kit/migrations.json"),
		JSON.stringify({
			sqlite: sqliteProgram(),
			mysql,
			postgres,
			mysqlTableOptions,
			mysqlFingerprints: migrationFingerprints(mysql),
		}),
	),
]);
