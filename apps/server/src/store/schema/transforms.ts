import type { SqlValue } from "../database.ts";
import type { ExternalDialect, MigrationConnection } from "./catalog.ts";
import type { DataStep } from "./model.ts";

function attachedIds(json: string): string[] {
	try {
		const values: unknown = JSON.parse(json);
		if (!Array.isArray(values)) return [];
		return values
			.map((item) => (item as { file_id?: unknown } | null)?.file_id)
			.filter((id): id is string => typeof id === "string" && Boolean(id.replace(/^ +| +$/g, "")));
	} catch {
		return [];
	}
}

type AttachmentSource = { subject_id: string; created_at: string; files_json: string };

function attachmentOwners(sources: AttachmentSource[]) {
	const owners = new Map<string, { subject: string; at: string; ambiguous?: boolean }>();
	for (const row of sources) {
		for (const id of attachedIds(row.files_json)) {
			const owner = owners.get(id);
			if (!owner) owners.set(id, { subject: row.subject_id, at: row.created_at });
			else if (owner.subject !== row.subject_id) owner.ambiguous = true;
			else if (row.created_at < owner.at) owner.at = row.created_at;
		}
	}
	return owners;
}

async function legacyFiles(db: MigrationConnection, dialect: ExternalDialect) {
	const sources = await db.rows<AttachmentSource>(
		"SELECT subject_id, created_at, files_json FROM kit_sessions WHERE files_json IS NOT NULL",
	);
	const conflict =
		dialect === "mysql" ? "ON DUPLICATE KEY UPDATE file_id = file_id" : "ON CONFLICT (file_id) DO NOTHING";
	for (const [id, owner] of attachmentOwners(sources)) {
		if (owner.ambiguous) continue;
		await db.execute(
			`INSERT INTO kit_uploaded_files (file_id, subject_id, created_at) VALUES (?, ?, ?) ${conflict}`,
			id,
			owner.subject,
			owner.at,
		);
	}
}

async function rebuildDailyUsage(db: MigrationConnection) {
	await db.execute("DELETE FROM kit_usage_limit_days");
	const months = await db.rows<{ member_id: string; month: string; tokens: number; active_seconds: number }>(
		"SELECT member_id, month, tokens, active_seconds FROM kit_usage_limit_months WHERE tokens > 0 OR active_seconds > 0",
	);
	for (const month of months) {
		const days = await db.rows<{ day: string; turns: number }>(
			"SELECT day, COUNT(*) AS turns FROM usage_turns WHERE subject_id = ? AND substr(day, 1, 7) = ? GROUP BY day ORDER BY day",
			month.member_id,
			month.month,
		);
		if (days.length === 0) continue;
		const total = days.reduce((sum, day) => sum + day.turns, 0);
		const shares = days.map((day) => ({ ...day, tokens: Math.floor((month.tokens * day.turns) / total) }));
		const remainder = month.tokens - shares.reduce((sum, share) => sum + share.tokens, 0);
		for (const share of shares
			.slice()
			.sort((a, b) => b.turns - a.turns || (a.day < b.day ? 1 : -1))
			.slice(0, remainder)) {
			share.tokens++;
		}
		let secondsLeft = month.active_seconds;
		for (const [index, share] of shares.entries()) {
			const seconds = index === shares.length - 1 ? secondsLeft : (month.active_seconds * share.turns) / total;
			secondsLeft -= seconds;
			await db.execute(
				"INSERT INTO kit_usage_limit_days (member_id, day, tokens, active_seconds) VALUES (?, ?, ?, ?)",
				month.member_id,
				share.day,
				share.tokens,
				seconds,
			);
		}
	}
}

async function retireDrafts(db: MigrationConnection) {
	const rows = await db.rows<Record<string, SqlValue> & { draft_id: string }>(
		"SELECT * FROM kit_resource_drafts WHERE engine != 'yaml'",
	);
	for (const row of rows) {
		const { active_owner: _, ...record } = row;
		const [document] = await db.rows<Record<string, SqlValue>>(
			"SELECT * FROM kit_resource_draft_documents WHERE draft_id = ?",
			row.draft_id,
		);
		await db.execute(
			"INSERT INTO kit_retired_directory_drafts (draft_id, record_json, document_json, retired_at) VALUES (?, ?, ?, ?)",
			row.draft_id,
			JSON.stringify(record),
			document ? JSON.stringify(document) : null,
			new Date().toISOString(),
		);
		await db.execute("DELETE FROM kit_resource_drafts WHERE draft_id = ?", row.draft_id);
	}
}

export async function executeData(db: MigrationConnection, dialect: ExternalDialect, step: DataStep) {
	if ("data" in step) {
		for (const sql of step.data) await db.execute(sql);
		return;
	}
	switch (step.transform) {
		case "legacyFiles":
			return legacyFiles(db, dialect);
		case "rebuildDailyUsage":
			return rebuildDailyUsage(db);
		case "retireDrafts":
			return retireDrafts(db);
	}
}
