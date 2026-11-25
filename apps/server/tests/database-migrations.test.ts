import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createConnection, type RowDataPacket } from "mysql2/promise";
import { Client, types } from "pg";
import { expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import type { SqlValue } from "../src/store/database.ts";
import { migrateSqliteSchema } from "../src/store/db.ts";
import { connectMysql } from "../src/store/mysql.ts";
import { connectPostgres } from "../src/store/postgres.ts";
import { type ExternalDialect, externalTableNames, type MigrationConnection } from "../src/store/schema/catalog.ts";
import { compileChange, readDefinition } from "../src/store/schema/changes.ts";
import { buildArtifacts } from "../src/store/schema/generate.ts";
import { program as mysqlProgram } from "../src/store/schema/generated/mysql.ts";
import { program as postgresProgram } from "../src/store/schema/generated/postgres.ts";
import { program as sqliteProgram } from "../src/store/schema/generated/sqlite.ts";
import manifest from "../src/store/schema/manifest.json" with { type: "json" };
import type { MigrationProgram, Table } from "../src/store/schema/model.ts";
import { forDialect, mysqlTableOptions } from "../src/store/schema/render.ts";
import { migrateMysqlSchema, migratePostgresSchema } from "../src/store/schema/runner.ts";
import { sqliteHistory } from "../src/store/sqlite-history.ts";
import { mysqlSchema } from "./fixtures/before-shared-mysql.ts";
import { postgresSchema } from "./fixtures/before-shared-postgres.ts";

const original = readFileSync(new URL("../src/store/schema/definition.sql", import.meta.url), "utf8");
const label = "O'Brien \\ data";
const added =
	original.replace(
		'CREATE TABLE "kit_members" (\n',
		`CREATE TABLE "kit_members" (\n  "remark" TEXT,\n  "label" VARCHAR(32) NOT NULL DEFAULT '${label.replaceAll("'", "''")}',\n`,
	) +
	'\nCREATE INDEX "idx_members_remark" ON "kit_members" ("remark");\n' +
	'CREATE TABLE "kit_migration_notes" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "note" TEXT);\n';
const renamed = added.replace('"remark" TEXT', '"note" TEXT').replace('("remark")', '("note")');
const renameSql = "ALTER TABLE kit_members RENAME COLUMN remark TO note";
const backfillSql = "UPDATE kit_members SET note = 'legacy' WHERE note IS NULL";
const explicit = {
	steps: [
		{ kind: "ddl" as const, sqlite: renameSql, mysql: renameSql, postgres: renameSql },
		{ kind: "data" as const, sqlite: backfillSql, mysql: backfillSql, postgres: backfillSql },
	],
};
const versions = [
	{ id: "034_add_member_remark", sql: added },
	{ id: "035_rename_remark", sql: renamed, explicit },
];

function withUpgrades(program: MigrationProgram, dialect: "sqlite" | ExternalDialect): MigrationProgram {
	const before = readDefinition(original);
	const middle = readDefinition(added);
	const final = readDefinition(renamed);
	return {
		...program,
		upgrades: [
			...program.upgrades,
			compileChange(versions[0]!.id, before, middle)[dialect],
			compileChange(versions[1]!.id, middle, final, explicit)[dialect],
		],
		current: forDialect(final, dialect),
	};
}

it("共享定义生成三库新增列、索引及显式迁移，未生成变更由检查检出", () => {
	expect(() => buildArtifacts([], added)).toThrow(/未生成/);
	expect(() => buildArtifacts(versions.slice(0, 1), renamed)).toThrow(/未生成/);
	expect(() => buildArtifacts([{ id: "033_remove", sql: renamed }], renamed)).not.toThrow();
	expect(() => compileChange("035_rename", readDefinition(added), readDefinition(renamed))).toThrow(/显式/);
	const artifacts = buildArtifacts(versions, renamed);
	for (const dialect of ["sqlite", "mysql", "postgres"]) {
		const migrations = artifacts.get(`generated/migrations.${dialect}.sql`);
		expect(migrations).toContain("-- 034_add_member_remark");
		expect(migrations).toMatch(/ADD COLUMN ["\x60]remark/);
		expect(migrations).toContain("idx_members_remark");
		expect(migrations).toMatch(/CREATE TABLE ["\x60]kit_migration_notes/);
		expect(migrations).toContain(renameSql);
		expect(migrations).toContain(backfillSql);
	}
});

it("MySQL 和 PostgreSQL 的迁移产物沿用完整清单顺序", () => {
	const ids = manifest.map(({ id }) => id);
	for (const program of [mysqlProgram, postgresProgram]) {
		expect([...program.history, ...program.upgrades].map(({ id }) => id)).toEqual(ids);
	}
});

it("SQLite 在已有成员上应用生成的变更，失败时回滚 DDL 和版本记录", () => {
	const db = new DatabaseSync(":memory:");
	try {
		migrateSqliteSchema(db);
		expect(
			db
				.prepare("SELECT id FROM _kit_migrations ORDER BY rowid")
				.all()
				.map((row) => row.id),
		).toEqual(manifest.map(({ id }) => id));
		expect(db.prepare("SELECT monthly_credits FROM quota_policy WHERE id = 1").get()).toEqual({
			monthly_credits: 200,
		});
		db.exec(`INSERT INTO kit_members (member_id, username, display_name, auth_type, status, password_hash, created_at, updated_at)
			VALUES ('member_fixture', 'member_fixture', '成员', 'local', 'active', 'test-only', '2026-11-19', '2026-11-19')`);
		const expected = withUpgrades(sqliteProgram, "sqlite");
		const addRemark = expected.upgrades.at(-2)!;
		const broken = {
			...expected,
			upgrades: [
				...sqliteProgram.upgrades,
				{
					...addRemark,
					steps: [...addRemark.steps, { data: ["UPDATE missing_table SET foo = 1"] }],
				},
			],
		};
		expect(() => migrateSqliteSchema(db, broken)).toThrow(/missing_table/);
		expect(db.prepare("SELECT 1 FROM pragma_table_info('kit_members') WHERE name = 'remark'").get()).toBeUndefined();
		expect(db.prepare("SELECT 1 FROM _kit_migrations WHERE id = ?").get(versions[0]!.id)).toBeUndefined();
		migrateSqliteSchema(db, expected);
		migrateSqliteSchema(db, expected);
		expect(db.prepare("SELECT display_name, note, label FROM kit_members").get()).toEqual({
			display_name: "成员",
			note: "legacy",
			label,
		});
	} finally {
		db.close();
	}
});

it("SQLite 升级保留额外的非唯一索引并继续校验已登记索引和唯一约束", () => {
	const db = new DatabaseSync(":memory:");
	try {
		migrateSqliteSchema(db);
		db.exec(`CREATE INDEX local_members_name ON kit_members (display_name);
			CREATE INDEX local_members_lower_name ON kit_members (lower(display_name));`);
		const upgraded = withUpgrades(sqliteProgram, "sqlite");
		migrateSqliteSchema(db, upgraded);
		migrateSqliteSchema(db, upgraded);
		const indexes = db.prepare("SELECT name FROM pragma_index_list('kit_members')").all();
		expect(indexes.map(({ name }) => name)).toEqual(
			expect.arrayContaining(["local_members_name", "local_members_lower_name", "idx_members_remark"]),
		);

		db.exec("CREATE UNIQUE INDEX local_members_unique_name ON kit_members (display_name)");
		expect(() => migrateSqliteSchema(db, upgraded)).toThrow(/kit_members.*indexes/);
		db.exec("DROP INDEX local_members_unique_name; DROP INDEX idx_members_remark;");
		expect(() => migrateSqliteSchema(db, upgraded)).toThrow(/kit_members.*indexes/);
	} finally {
		db.close();
	}
});

async function openExternal(dialect: ExternalDialect, url: string) {
	const config = loadConfig({
		KIT_DB_DRIVER: dialect,
		KIT_DATABASE_URL: url,
		KIT_GATEWAY: "mock",
		KIT_DATA_DIR: tmpdir(),
	}).database;
	if (config.driver === "sqlite") throw new Error("expected network database");
	const options = { host: config.host, port: config.port, user: config.user, password: config.password };
	const name = `kit_migrations_${randomUUID().replaceAll("-", "")}`;
	if (config.driver === "mysql") {
		const ssl = config.ssl ? { rejectUnauthorized: true, verifyIdentity: true } : undefined;
		const admin = await createConnection({ ...options, ssl, database: config.name });
		await admin.query(`CREATE DATABASE ${name}`);
		const client = await createConnection({ ...options, ssl, database: name });
		const db: MigrationConnection = {
			async rows<T>(sql: string, ...values: SqlValue[]) {
				const [rows] = await client.execute<RowDataPacket[]>(sql, values);
				return rows as T[];
			},
			async execute(sql, ...values) {
				if (values.length) await client.execute(sql, values);
				else await client.query(sql);
			},
		};
		return {
			db,
			run: (program: MigrationProgram, connection = db) =>
				migrateMysqlSchema(connection, program, async (work) => {
					await client.beginTransaction();
					try {
						await work();
						await client.commit();
					} catch (error) {
						await client.rollback();
						throw error;
					}
				}),
			connect: () => connectMysql({ ...config, name }),
			async close() {
				await client.end();
				await admin.query(`DROP DATABASE ${name}`);
				await admin.end();
			},
		};
	}
	const settings = {
		...options,
		password: () => config.password,
		ssl: config.ssl ? { rejectUnauthorized: true } : false,
		types: {
			getTypeParser(oid: number) {
				return [types.builtins.INT8, types.builtins.NUMERIC].includes(oid) ? Number : types.getTypeParser(oid);
			},
		},
	};
	const admin = new Client({ ...settings, database: config.name });
	await admin.connect();
	await admin.query(`CREATE DATABASE ${name}`);
	const client = new Client({ ...settings, database: name });
	await client.connect();
	const bind = (sql: string) => {
		let index = 0;
		return sql.replace(/\?/g, () => `$${++index}`);
	};
	const db: MigrationConnection = {
		async rows<T>(sql: string, ...values: SqlValue[]) {
			return (await client.query(bind(sql), values)).rows as T[];
		},
		async execute(sql, ...values) {
			await client.query(values.length ? bind(sql) : sql, values.length ? values : undefined);
		},
	};
	return {
		db,
		async run(program: MigrationProgram, connection = db) {
			await client.query("BEGIN");
			try {
				await migratePostgresSchema(connection, program);
				await client.query("COMMIT");
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			}
		},
		connect: () => connectPostgres({ ...config, name }),
		async close() {
			await client.end();
			await admin.query(`DROP DATABASE ${name}`);
			await admin.end();
		},
	};
}

function historyThrough(program: MigrationProgram, last: string): MigrationProgram {
	const target = program.history.findIndex((entry) => entry.id === last);
	expect(target).toBeGreaterThanOrEqual(0);
	const history = program.history.slice(0, target + 1);
	const tables = new Map<string, Table>();
	for (const version of history) {
		for (const step of version.steps) {
			if (!("changes" in step)) continue;
			for (const { name, after } of step.changes) {
				if (after) tables.set(name, after);
				else tables.delete(name);
			}
		}
	}
	return { history, upgrades: [], current: [...tables.values()] };
}

async function seedHistoricalData(fixture: Awaited<ReturnType<typeof openExternal>>, program: MigrationProgram) {
	const { db } = fixture;
	await fixture.run(historyThrough(program, "005_member_auth"));
	await db.execute(`INSERT INTO kit_sessions (session_id, subject_id, agent_slug, files_json, created_at)
		VALUES ('session_legacy','member_fixture','assistant','[{"file_id":"old_attachment"}]','2026-10-20')`);
	await db.execute(`INSERT INTO usage_turns (subject_id, agent_slug, session_id, day, month, created_at)
		VALUES ('member_fixture','assistant','session_legacy','2026-10-20','2026-10','2026-10-20')`);
	await fixture.run(historyThrough(program, "020_usage_limit_days"));
	await db.execute(`INSERT INTO kit_usage_limit_sessions (session_id, member_id, input_tokens, output_tokens, active_seconds, admission_month, captured_at)
		VALUES ('session_legacy','member_fixture',8,4,3.5,'2026-10','2026-10-20')`);
	await db.execute(`INSERT INTO kit_usage_limit_months (member_id, month, tokens, active_seconds)
		VALUES ('member_fixture','2026-10',7,2.5)`);
	const afterBackfill = historyThrough(program, "030_resource_draft_assets");
	await expect(
		fixture.run(afterBackfill, {
			...db,
			async execute(sql, ...values) {
				await db.execute(sql, ...values);
				if (sql.startsWith("INSERT INTO kit_usage_limit_days (")) throw new Error("injected backfill interruption");
			},
		}),
	).rejects.toThrow(/021_usage_limit_days_backfill 第 1 步失败/);
	expect(await db.rows("SELECT member_id FROM kit_usage_limit_days")).toEqual([]);
	expect(await db.rows("SELECT id FROM _kit_migrations WHERE id = '021_usage_limit_days_backfill'")).toEqual([]);
	await fixture.run(afterBackfill);
	expect(await db.rows("SELECT tokens, active_seconds FROM kit_usage_limit_days")).toEqual([
		{ tokens: 7, active_seconds: 2.5 },
	]);
	await db.execute(`INSERT INTO kit_resource_drafts (draft_id,owner,status,phase,created_at,updated_at)
		VALUES ('old_draft','owner','draft','editable','2026-10-20','2026-10-20')`);
	await db.execute("INSERT INTO kit_resource_draft_documents (draft_id,yaml) VALUES ('old_draft','draft bytes')");
	await db.execute(`INSERT INTO kit_members (member_id,username,display_name,auth_type,status,password_hash,created_at,updated_at)
		VALUES ('member_fixture','member_fixture','成员','local','active','fixture','2026-10-20','2026-10-20')`);
}

for (const [dialect, url, program] of [
	["mysql", process.env.KIT_TEST_MYSQL_URL, mysqlProgram],
	["postgres", process.env.KIT_TEST_POSTGRES_URL, postgresProgram],
] as const) {
	it.skipIf(!url)(
		`${dialect} 从四张表起步，保留历史数据并执行生成的增量`,
		async () => {
			const fixture = await openExternal(dialect, url!);
			try {
				await fixture.run(historyThrough(program, "001_init"));
				const names = await externalTableNames(fixture.db, dialect);
				expect(names.filter((name) => !name.startsWith("_")).sort()).toEqual([
					"catalog_agents",
					"kit_audit",
					"kit_operations",
					"kit_sessions",
				]);
				await seedHistoricalData(fixture, program);
				const upgraded = withUpgrades(program, dialect);
				await fixture.run(upgraded);
				await fixture.run(upgraded);
				const ids = (await fixture.db.rows<{ id: string }>("SELECT id FROM _kit_migrations")).map(({ id }) => id);
				expect(new Set(ids)).toEqual(new Set([...sqliteHistory, ...upgraded.upgrades].map(({ id }) => id)));
				expect(await fixture.db.rows("SELECT product_name FROM kit_branding WHERE id = 1")).toEqual([
					{ product_name: "OpenAgentKit" },
				]);
				expect(await fixture.db.rows("SELECT purpose,agent_slug FROM kit_sessions")).toEqual([
					{ purpose: "experience", agent_slug: "assistant" },
				]);
				expect(await fixture.db.rows("SELECT file_id,subject_id FROM kit_uploaded_files")).toEqual([
					{ file_id: "old_attachment", subject_id: "member_fixture" },
				]);
				expect(await fixture.db.rows("SELECT draft_id FROM kit_retired_directory_drafts")).toEqual([
					{ draft_id: "old_draft" },
				]);
				expect(await fixture.db.rows("SELECT draft_id FROM kit_resource_draft_documents")).toEqual([]);
				expect(await fixture.db.rows("SELECT display_name,note,label FROM kit_members")).toEqual([
					{ display_name: "成员", note: "legacy", label },
				]);
			} finally {
				await fixture.close();
			}
		},
		45_000,
	);

	it.skipIf(!url)(
		`${dialect} 按旧版本接续且结构不符时拒绝启动`,
		async () => {
			const fixture = await openExternal(dialect, url!);
			try {
				const ddl = dialect === "mysql" ? mysqlSchema.map((sql) => `${sql} ${mysqlTableOptions}`) : postgresSchema;
				for (const statement of ddl) await fixture.db.execute(statement);
				const id = dialect === "mysql" ? "001_initial_mysql_schema" : "001_initial_postgres_schema";
				await fixture.db.execute(
					"CREATE TABLE _kit_migrations (id VARCHAR(100) PRIMARY KEY, applied_at VARCHAR(32) NOT NULL)",
				);
				await fixture.db.execute("INSERT INTO _kit_migrations VALUES (?, ?)", id, "2026-10-20");
				await fixture.db.execute("INSERT INTO quota_policy (id, monthly_credits) VALUES (1, 321)");
				await fixture.db.execute(
					"INSERT INTO kit_branding (id, product_name, updated_at, updated_by) VALUES (1, ?, ?, ?)",
					"OpenAgentPack Kit",
					"2026-10-20",
					"admin:branding",
				);
				const db = await fixture.connect();
				try {
					expect(await db.all("SELECT id FROM _kit_migrations ORDER BY id")).toEqual([
						{ id },
						{ id: "033_openagentkit_default_branding" },
						{ id: "kit_history_adopted" },
					]);
					expect(await db.get("SELECT monthly_credits FROM quota_policy WHERE id = 1")).toMatchObject({
						monthly_credits: 321,
					});
					expect(await db.get("SELECT product_name FROM kit_branding WHERE id = 1")).toEqual({
						product_name: "OpenAgentPack Kit",
					});
					expect(await db.all("SELECT draft_id FROM kit_retired_directory_drafts")).toEqual([]);
					await db.run("ALTER TABLE kit_members ADD COLUMN untracked TEXT");
				} finally {
					await db.close();
				}
				await expect(fixture.connect()).rejects.toThrow(/kit_members.*与预期结构不符/);
			} finally {
				await fixture.close();
			}
		},
		45_000,
	);

	it.skipIf(!url)(
		`${dialect} 首条 DDL 后中断时可安全重启`,
		async () => {
			const fixture = await openExternal(dialect, url!);
			try {
				const failed: MigrationConnection = {
					...fixture.db,
					async execute(sql, ...values) {
						await fixture.db.execute(sql, ...values);
						if (/^CREATE TABLE [\x60"]catalog_agents[\x60"] /i.test(sql)) throw new Error("injected interruption");
					},
				};
				await expect(fixture.run(program, failed)).rejects.toThrow(/001_init 第 1 步失败/);
				const names = await externalTableNames(fixture.db, dialect);
				expect(names.includes("catalog_agents")).toBe(dialect === "mysql");
				const db = await fixture.connect();
				try {
					expect(await db.all("SELECT id FROM _kit_migrations")).toHaveLength(
						sqliteHistory.length + program.upgrades.length,
					);
				} finally {
					await db.close();
				}
			} finally {
				await fixture.close();
			}
		},
		45_000,
	);
}
