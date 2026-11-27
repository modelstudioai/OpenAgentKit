import type { DatabaseSync } from "node:sqlite";
import type { Migration, Step } from "../metadata/model.ts";
import { sqliteTableDifference } from "../metadata/sqlite-model.ts";
import { sqliteHistory } from "../sqlite-history.ts";
import { program } from "./generated/sqlite.ts";

function applyVersion(db: DatabaseSync, id: string, apply: () => void, rebuild = false) {
	if (rebuild) db.exec("PRAGMA foreign_keys = OFF");
	try {
		db.exec("BEGIN IMMEDIATE");
		try {
			if (!db.prepare("SELECT 1 FROM _kit_migrations WHERE id = ?").get(id)) {
				apply();
				if (rebuild && db.prepare("PRAGMA foreign_key_check").get()) throw new Error("SQLite 重建后有外键冲突");
				db.prepare("INSERT INTO _kit_migrations (id, applied_at) VALUES (?, ?)").run(id, new Date().toISOString());
			}
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	} finally {
		if (rebuild) db.exec("PRAGMA foreign_keys = ON");
	}
}

function applyStep(db: DatabaseSync, id: string, step: Step) {
	if ("data" in step) {
		for (const sql of step.data) db.exec(sql);
		return;
	}
	if (!("sql" in step)) throw new Error(`SQLite 迁移包含未识别的数据转换：${id}`);
	for (const { name, before, after } of step.changes) {
		const difference = sqliteTableDifference(db, name, before, after);
		if (difference) throw new Error(`SQLite 迁移 ${id}：${name} 的 ${difference} 与迁移前结构不符`);
	}
	db.exec(step.sql);
	for (const { name, before, after } of step.changes) {
		const difference = sqliteTableDifference(db, name, after, before);
		if (difference) throw new Error(`SQLite 迁移 ${id}：${name} 的 ${difference} 与迁移后结构不符`);
	}
}

function applyNewVersions(db: DatabaseSync, versions: Migration[], applied: Set<string>) {
	const known = new Set(versions.map((version) => version.id));
	for (const id of applied) {
		if (Number.parseInt(id, 10) >= 33 && !known.has(id)) throw new Error(`SQLite 迁移记录包含未知版本：${id}`);
	}
	const firstPending = versions.findIndex((version) => !applied.has(version.id));
	if (firstPending < 0) return;
	const pending = versions.slice(firstPending);
	if (pending.some((version) => applied.has(version.id))) {
		throw new Error(`SQLite 迁移记录不连续，缺少版本：${pending[0]!.id}`);
	}
	for (const migration of pending) {
		applyVersion(
			db,
			migration.id,
			() => {
				for (const step of migration.steps) applyStep(db, migration.id, step);
			},
			migration.sqliteRebuild,
		);
	}
}

/** 旧库按已登记的历史继续，每个版本在写锁内再次检查并提交。 */
export function upgradeSqlite(db: DatabaseSync, applied: Set<string>, upgrades: Migration[] = program.upgrades) {
	for (const migration of sqliteHistory) {
		if (applied.has(migration.id)) continue;
		applyVersion(db, migration.id, () => {
			if (migration.run) migration.run(db);
			else db.exec(migration.sql!);
		});
	}
	applyNewVersions(db, upgrades, applied);
}
