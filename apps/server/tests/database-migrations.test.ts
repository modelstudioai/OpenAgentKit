import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createConnection, type RowDataPacket } from "mysql2/promise";
import { Client, types } from "pg";
import { DataSource } from "typeorm";
import { expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { readEntityDefinition } from "../src/entity/definition.ts";
import { validateEntityDefinitions } from "../src/entity/schema.ts";
import { entityClasses } from "../src/entity/tables/index.ts";
import type { SqlValue } from "../src/store/database.ts";
import { migrateSqliteSchema } from "../src/store/db.ts";
import { inspectRegistry, type MysqlTransaction, validateCurrent } from "../src/store/external-execution.ts";
import { initializeExternal } from "../src/store/external-schema.ts";
import { type ExternalDialect, externalTableNames, type MigrationConnection } from "../src/store/metadata/catalog.ts";
import type { MigrationProgram, Table } from "../src/store/metadata/model.ts";
import manifest from "../src/store/migration-manifest.json" with { type: "json" };
import { connectMysql } from "../src/store/mysql.ts";
import { connectPostgres } from "../src/store/postgres.ts";
import { compileChange, readDefinition } from "../src/store/schema/changes.ts";
import { buildArtifacts } from "../src/store/schema/generate.ts";
import { program as mysqlProgram } from "../src/store/schema/generated/mysql.ts";
import { program as postgresProgram } from "../src/store/schema/generated/postgres.ts";
import { program as sqliteProgram } from "../src/store/schema/generated/sqlite.ts";
import { forDialect, mysqlTableOptions, renderEntityDefinition } from "../src/store/schema/render.ts";
import { upgradeExternal } from "../src/store/schema/runner.ts";
import { sqliteHistory } from "../src/store/sqlite-history.ts";
import { createEntityDataSource } from "../src/store/typeorm.ts";
import { mysqlSchema } from "./fixtures/before-shared-mysql.ts";
import { postgresSchema } from "./fixtures/before-shared-postgres.ts";

const original = readFileSync(
	new URL("../src/store/schema/versions/034_oidc_member_auth.sql", import.meta.url),
	"utf8",
);
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
	{ id: "035_add_member_remark", sql: added },
	{ id: "036_rename_remark", sql: renamed, explicit },
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
	expect(() => compileChange("036_rename", readDefinition(added), readDefinition(renamed))).toThrow(/显式/);
	const migrations = buildArtifacts(versions, renamed);
	for (const dialect of ["sqlite", "mysql", "postgres"]) {
		const sql = migrations.get(`generated/migrations.${dialect}.sql`);
		expect(sql).toContain("-- 035_add_member_remark");
		expect(sql).toMatch(/ADD COLUMN ["\x60]remark/);
		expect(sql).toContain("idx_members_remark");
		expect(sql).toMatch(/CREATE TABLE ["\x60]kit_migration_notes/);
		expect(sql).toContain(renameSql);
		expect(sql).toContain(backfillSql);
	}
});

it("实体生成的 SQL 快照可以回读，并能检出字段约束漂移", () => {
	const snapshot = readDefinition(renderEntityDefinition(readEntityDefinition()));
	expect(() => validateEntityDefinitions(snapshot)).not.toThrow();
	const email = snapshot.find(({ name }) => name === "kit_members")!.columns.find(({ name }) => name === "email")!;
	email.nullable = !email.nullable;
	expect(() => validateEntityDefinitions(snapshot)).toThrow(/kit_members\.email/);
});

it("三库实体沿用当前结构、组合主键、自增和二进制类型", () => {
	const connections = [
		[
			sqliteProgram,
			createEntityDataSource({ type: "better-sqlite3", database: ":memory:", driver: class {} }),
			"blob",
			"NOCASE",
			"directory",
		],
		[mysqlProgram, createEntityDataSource({ type: "mysql", database: "kit" }), "longblob", "ascii_general_ci", "yaml"],
		[postgresProgram, createEntityDataSource({ type: "postgres" }), "bytea", undefined, "yaml"],
	] as const;
	for (const [program, source, binaryType, usernameCollation, draftEngine] of connections) {
		expect(source.options.entities).toEqual(Object.values(entityClasses));
		expect(source.options.synchronize).toBe(false);
		expect(source.entityMetadatas).toHaveLength(program.current.length);
		for (const table of program.current) {
			const target = entityClasses[table.name as keyof typeof entityClasses];
			const entity = source.getMetadata(target);
			expect(entity.target).toBe(target);
			expect(entity.tableName).toBe(table.name);
			expect(entity.columns.map((column) => column.databaseName)).toEqual(table.columns.map((column) => column.name));
			expect(entity.primaryColumns.map((column) => column.databaseName).sort()).toEqual([...table.primary].sort());
		}
		const column = (table: keyof typeof entityClasses, name: string) =>
			source.getMetadata(entityClasses[table]).columns.find((column) => column.databaseName === name);
		expect(column("kit_audit", "id")?.generationStrategy).toBe(program === postgresProgram ? "identity" : "increment");
		expect(column("kit_branding_logo", "bytes")?.type).toBe(binaryType);
		expect(column("kit_members", "email")?.isNullable).toBe(true);
		expect(column("kit_members", "username")?.collation).toBe(usernameCollation);
		expect(column("kit_resource_drafts", "engine")?.default).toBe(draftEngine);
		const activeOwner = column("kit_resource_drafts", "active_owner");
		if (program === mysqlProgram) {
			expect(activeOwner).toMatchObject({
				generatedType: "STORED",
				asExpression: "CASE WHEN status != 'published' OR cleanup_pending = 1 THEN owner END",
			});
		} else {
			expect(activeOwner).toBeUndefined();
		}
	}
	// 三个连接的方言配置也不能污染下一次启动时读取的原始类元数据。
	expect(() => validateEntityDefinitions(sqliteProgram.current)).not.toThrow();
});

it("MySQL 和 PostgreSQL 的迁移产物沿用完整清单顺序", () => {
	const ids = manifest.map(({ id }) => id);
	for (const program of [mysqlProgram, postgresProgram]) {
		expect([...program.history, ...program.upgrades].map(({ id }) => id)).toEqual(ids);
	}
});

it("没有迁移记录的非空 SQLite 不进入实体建库流程", async () => {
	const db = new DatabaseSync(":memory:");
	try {
		db.exec("CREATE TABLE unrelated (id INTEGER); INSERT INTO unrelated VALUES (9)");
		await expect(migrateSqliteSchema(db)).rejects.toThrow(/已有表但缺少 Kit 迁移记录/);
		expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()).toEqual([{ name: "unrelated" }]);
		expect(db.prepare("SELECT id FROM unrelated").get()).toEqual({ id: 9 });
	} finally {
		db.close();
	}
});

it("SQLite 空库直接按实体建表，与历史升级的业务初始数据、版本基线一致", async () => {
	const fresh = new DatabaseSync(":memory:");
	const legacy = new DatabaseSync(":memory:");
	try {
		const first = sqliteHistory[0]!;
		legacy.exec("CREATE TABLE _kit_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
		legacy.exec(first.sql!);
		legacy.prepare("INSERT INTO _kit_migrations VALUES (?, ?)").run(first.id, "2026-10-20");
		await migrateSqliteSchema(legacy);
		// 旧版的数据迁移只能在升级旧库时运行。
		await migrateSqliteSchema(fresh, {
			...sqliteProgram,
			upgrades: sqliteProgram.upgrades.map((version) => ({
				...version,
				steps: [{ data: ["INSERT INTO obsolete_table VALUES (1)"] }],
			})),
		});
		for (const table of sqliteProgram.current) {
			const sql = `SELECT * FROM "${table.name}"`;
			expect(fresh.prepare(sql).all()).toEqual(legacy.prepare(sql).all());
		}
		const ids = "SELECT id FROM _kit_migrations ORDER BY id";
		expect(fresh.prepare(ids).all()).toEqual(legacy.prepare(ids).all());
	} finally {
		fresh.close();
		legacy.close();
	}
});

it("SQLite 在已有成员上应用生成的变更，失败时回滚 DDL 和版本记录", async () => {
	const db = new DatabaseSync(":memory:");
	try {
		await migrateSqliteSchema(db);
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
		await expect(migrateSqliteSchema(db, broken)).rejects.toThrow(/missing_table/);
		expect(db.prepare("SELECT 1 FROM pragma_table_info('kit_members') WHERE name = 'remark'").get()).toBeUndefined();
		expect(db.prepare("SELECT 1 FROM _kit_migrations WHERE id = ?").get(versions[0]!.id)).toBeUndefined();
		await migrateSqliteSchema(db, expected);
		await migrateSqliteSchema(db, expected);
		expect(db.prepare("SELECT display_name, note, label FROM kit_members").get()).toEqual({
			display_name: "成员",
			note: "legacy",
			label,
		});
	} finally {
		db.close();
	}
});

it("SQLite 升级保留额外的非唯一索引并继续校验已登记索引和唯一约束", async () => {
	const db = new DatabaseSync(":memory:");
	try {
		await migrateSqliteSchema(db);
		db.exec(`CREATE INDEX local_members_name ON kit_members (display_name);
			CREATE INDEX local_members_lower_name ON kit_members (lower(display_name));`);
		const upgraded = withUpgrades(sqliteProgram, "sqlite");
		await migrateSqliteSchema(db, upgraded);
		await migrateSqliteSchema(db, upgraded);
		const indexes = db.prepare("SELECT name FROM pragma_index_list('kit_members')").all();
		expect(indexes.map(({ name }) => name)).toEqual(
			expect.arrayContaining(["local_members_name", "local_members_lower_name", "idx_members_remark"]),
		);

		db.exec("CREATE UNIQUE INDEX local_members_unique_name ON kit_members (display_name)");
		await expect(migrateSqliteSchema(db, upgraded)).rejects.toThrow(/kit_members.*indexes/);
		db.exec("DROP INDEX local_members_unique_name; DROP INDEX idx_members_remark;");
		await expect(migrateSqliteSchema(db, upgraded)).rejects.toThrow(/kit_members.*indexes/);
	} finally {
		db.close();
	}
});

async function runExternal(
	target: MigrationProgram | DataSource,
	db: MigrationConnection,
	dialect: ExternalDialect,
	transaction?: MysqlTransaction,
) {
	if (target instanceof DataSource) return initializeExternal(db, dialect, target, transaction);
	const state = await inspectRegistry(db, dialect);
	await upgradeExternal(db, dialect, state, target, target.current, transaction);
}

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
			source: () =>
				createEntityDataSource({ type: "mysql", ...options, username: options.user, ssl, database: name }).initialize(),
			run: (program: MigrationProgram | DataSource, connection = db) =>
				runExternal(program, connection, "mysql", async (work) => {
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
		source: () =>
			createEntityDataSource({
				type: "postgres",
				...options,
				username: options.user,
				ssl: settings.ssl,
				database: name,
				installExtensions: false,
			}).initialize(),
		async run(program: MigrationProgram | DataSource, connection = db) {
			await client.query("BEGIN");
			try {
				await runExternal(program, connection, "postgres");
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
				// 从旧发布包真实执行过的首个版本起步，随后由当前版本逐步升级。
				const first = program.history[0]!;
				for (const step of first.steps) {
					if (!("sql" in step)) throw new Error("初始迁移应当只包含 DDL");
					await fixture.db.execute(step.sql);
				}
				await fixture.db.execute(
					"CREATE TABLE _kit_migrations (id VARCHAR(100) PRIMARY KEY, applied_at VARCHAR(32) NOT NULL)",
				);
				await fixture.db.execute("INSERT INTO _kit_migrations VALUES (?, ?)", first.id, "2026-10-20");
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
					const expectedIds = [id, "kit_history_adopted", ...program.upgrades.map((upgrade) => upgrade.id)].sort();
					expect(await fixture.db.rows("SELECT id FROM _kit_migrations ORDER BY id")).toEqual(
						expectedIds.map((id) => ({ id })),
					);
					expect((await fixture.db.rows("SELECT monthly_credits FROM quota_policy WHERE id = 1"))[0]).toMatchObject({
						monthly_credits: 321,
					});
					expect((await fixture.db.rows("SELECT product_name FROM kit_branding WHERE id = 1"))[0]).toEqual({
						product_name: "OpenAgentPack Kit",
					});
					expect(await fixture.db.rows("SELECT draft_id FROM kit_retired_directory_drafts")).toEqual([]);
					await fixture.db.execute("ALTER TABLE kit_members ADD COLUMN untracked TEXT");
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
		`${dialect} 原生实体建库并发启动只写一份初始数据，物理结构对齐旧基线`,
		async () => {
			const fixture = await openExternal(dialect, url!);
			try {
				const stores = await Promise.all([fixture.connect(), fixture.connect()]);
				try {
					await validateCurrent(fixture.db, dialect, program.current);
					expect(await fixture.db.rows("SELECT monthly_credits FROM quota_policy")).toEqual([{ monthly_credits: 200 }]);
					expect(await fixture.db.rows("SELECT id FROM _kit_migrations")).toHaveLength(
						program.history.length + program.upgrades.length,
					);
				} finally {
					await Promise.all(stores.map((store) => store.close()));
				}
			} finally {
				await fixture.close();
			}
		},
		45_000,
	);

	it.skipIf(!url)(
		`${dialect} TypeORM 建表中断后可用原版本续建或接续新版迁移`,
		async () => {
			const fixture = await openExternal(dialect, url!);
			let source: DataSource | undefined;
			try {
				source = await fixture.source();
				const failed: MigrationConnection = {
					...fixture.db,
					async execute(sql, ...values) {
						await fixture.db.execute(sql, ...values);
						if (/^CREATE TABLE [`"]catalog_agents[`"] /i.test(sql)) throw new Error("injected interruption");
					},
				};
				await expect(fixture.run(source, failed)).rejects.toThrow(/kit_typeorm_bootstrap_\d+ 第 1 步失败/);
				const names = await externalTableNames(fixture.db, dialect);
				expect(names.includes("catalog_agents")).toBe(dialect === "mysql");
				// MySQL 中断的非事务 DDL 在更新的发布版本中可核对原指纹并恢复。
				const upgraded = withUpgrades(program, dialect);
				if (dialect === "mysql") {
					// 同版本接续首次 DDL。制造最后登记失败，保证种子和基线一起回滚，
					// 随后换版本从已落库的 DDL 继续，无需重发任何写入。
					await expect(
						fixture.run(source, {
							...fixture.db,
							async execute(sql, ...values) {
								await fixture.db.execute(sql, ...values);
								if (sql.startsWith("INSERT INTO _kit_migrations"))
									throw new Error("injected finalization interruption");
							},
						}),
					).rejects.toThrow(/kit_typeorm_bootstrap_\d+ 第 \d+ 步失败/);
					expect(await fixture.db.rows("SELECT id FROM _kit_migrations")).toEqual([]);
					expect(await fixture.db.rows("SELECT id FROM quota_policy")).toEqual([]);
					await fixture.run(upgraded);
				} else {
					await fixture.run(source);
					await fixture.run(upgraded);
				}
				await validateCurrent(fixture.db, dialect, upgraded.current);
				expect(await fixture.db.rows("SELECT monthly_credits FROM quota_policy")).toEqual([{ monthly_credits: 200 }]);
			} finally {
				await source?.destroy();
				await fixture.close();
			}
		},
		45_000,
	);

	it.skipIf(!url)(
		`${dialect} 实体建库在首条 DDL 后中断时可安全重启`,
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
				await expect(fixture.run(program, failed)).rejects.toThrow(/kit_entity_bootstrap_\d+ 第 1 步失败/);
				const names = await externalTableNames(fixture.db, dialect);
				expect(names.includes("catalog_agents")).toBe(dialect === "mysql");
				const upgraded = withUpgrades(program, dialect);
				if (dialect === "mysql") {
					await fixture.db.execute("CREATE VIEW unrelated_view AS SELECT 1 AS id");
					await expect(fixture.run(upgraded)).rejects.toThrow(/实体建库进度之外/);
					await fixture.db.execute("DROP VIEW unrelated_view");
				}
				await fixture.run(upgraded);
				expect(await fixture.db.rows("SELECT note FROM kit_migration_notes")).toEqual([]);
				expect(await fixture.db.rows("SELECT id FROM _kit_migrations")).toHaveLength(
					sqliteHistory.length + upgraded.upgrades.length,
				);
				expect(await fixture.db.rows("SELECT monthly_credits FROM quota_policy")).toEqual([{ monthly_credits: 200 }]);
			} finally {
				await fixture.close();
			}
		},
		45_000,
	);
}

const mysqlUrl = process.env.KIT_TEST_MYSQL_URL;
it.skipIf(!mysqlUrl)(
	"MySQL 恢复曾因 OIDC TEXT 键建表失败的迁移，修复过程中断后仍可重启",
	async () => {
		const fixture = await openExternal("mysql", mysqlUrl!);
		const id = "034_oidc_member_auth";
		const beforeOidc = mysqlProgram.upgrades.findIndex((upgrade) => upgrade.id === id);
		expect(beforeOidc).toBeGreaterThanOrEqual(0);
		try {
			await fixture.run({
				...mysqlProgram,
				upgrades: mysqlProgram.upgrades.slice(0, beforeOidc),
				current: mysqlProgram.current.filter((table) => !table.name.startsWith("kit_oidc_")),
			});
			await fixture.db.execute(
				"INSERT INTO _kit_migration_progress (slot, id, step_index, inflight, fingerprint) VALUES (1, ?, 0, 1, ?)",
				id,
				"bf9eb32864267c249db7ef954829ded485e42a9532af3fee04b95de4ac45a9b4",
			);
			await expect(
				fixture.run(mysqlProgram, {
					...fixture.db,
					async execute(sql, ...values) {
						await fixture.db.execute(sql, ...values);
						if (sql.startsWith("CREATE TABLE `kit_oidc_member_bindings`")) throw new Error("injected interruption");
					},
				}),
			).rejects.toThrow(/034_oidc_member_auth 第 1 步失败/);
			const db = await fixture.connect();
			try {
				expect(await fixture.db.rows("SELECT id FROM _kit_migrations WHERE id = ?", id)).toEqual([{ id }]);
				expect(await fixture.db.rows("SELECT id FROM _kit_migration_progress")).toEqual([]);
				expect(await fixture.db.rows("SELECT subject_key FROM kit_oidc_member_bindings")).toEqual([]);
			} finally {
				await db.close();
			}
		} finally {
			await fixture.close();
		}
	},
	45_000,
);
