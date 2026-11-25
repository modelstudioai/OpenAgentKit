import { KitError, type ProjectResourceBinding, type ResourceDraftView } from "@openagentkit/sdk/protocol";
import type { ResourceDraftPublishedBinding } from "../resource-draft-types.ts";
import type { StoreDatabase } from "./database.ts";

export interface ResourceDraftRecord {
	draft_id: string;
	owner: string;
	cleanup_key_hash: string | null;
	status: ResourceDraftView["status"];
	phase: "editable" | "executing" | "uncertain" | "succeeded";
	resources_json: string;
	cleanup_pending: number;
	operation_id: string | null;
	expected_revision: string | null;
	created_at: string;
	updated_at: string;
}

export function resourceDraftView(row: ResourceDraftRecord): ResourceDraftView {
	return {
		draft_id: row.draft_id,
		project_name: row.draft_id,
		status: row.status,
		resources: (JSON.parse(row.resources_json) as ResourceDraftPublishedBinding[]).filter(
			(resource): resource is ProjectResourceBinding => resource.type !== "skill",
		),
		cleanup_pending: Boolean(row.cleanup_pending),
		recovery_action:
			row.status === "published"
				? row.cleanup_pending
					? "finalize"
					: "none"
				: row.phase === "editable"
					? "replan"
					: "read_result",
		...(row.operation_id ? { operation_id: row.operation_id } : {}),
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

export function createResourceDraftStore(db: StoreDatabase) {
	return {
		async get(id: string): Promise<ResourceDraftRecord | null> {
			return (
				((await db.get("SELECT * FROM kit_resource_drafts WHERE draft_id=?", id)) as unknown as ResourceDraftRecord) ??
				null
			);
		},
		async active(owner: string): Promise<ResourceDraftRecord | null> {
			return (
				((await db.get(
					"SELECT * FROM kit_resource_drafts WHERE owner=? AND (status!='published' OR cleanup_pending=1)",
					owner,
				)) as unknown as ResourceDraftRecord) ?? null
			);
		},
		async create(id: string, owner: string, cleanupKeyHash?: string) {
			const now = new Date().toISOString();
			await db.run(
				"INSERT INTO kit_resource_drafts (draft_id,owner,cleanup_key_hash,status,phase,created_at,updated_at,engine) VALUES (?,?,?,'draft','editable',?,?,'yaml')",
				id,
				owner,
				cleanupKeyHash ?? null,
				now,
				now,
			);
			return (await this.get(id))!;
		},
		async operation(id: string, operationId: string) {
			await db.run(
				"UPDATE kit_resource_drafts SET operation_id=?,updated_at=? WHERE draft_id=?",
				operationId,
				new Date().toISOString(),
				id,
			);
		},
		async document(id: string) {
			return (await db.get("SELECT * FROM kit_resource_draft_documents WHERE draft_id=?", id)) as
				| {
						draft_id: string;
						revision: number;
						yaml: string;
						assets_json: string;
						sdk_state_json: string;
						proof_json: string | null;
				  }
				| undefined;
		},
		async initializeDocument(id: string, yaml: string) {
			await db.insertIfAbsent(
				"INSERT INTO kit_resource_draft_documents (draft_id,yaml) VALUES (?,?)",
				"draft_id",
				id,
				yaml,
			);
		},
		async writeDocument(id: string, expected: string, yaml: string, assets?: string) {
			return db.transaction(async () => {
				const result = await db.run(
					"UPDATE kit_resource_draft_documents SET yaml=?,assets_json=COALESCE(?,assets_json),revision=revision+1 WHERE draft_id=? AND TRIM(CAST(revision AS CHAR(32)))=? AND EXISTS (SELECT 1 FROM kit_resource_drafts WHERE draft_id=? AND phase='editable' AND status!='published')",
					yaml,
					assets ?? null,
					id,
					expected,
					id,
				);
				if (!result.changes) throw new KitError("conflict", "批次配置已变化，请重新加载");
				return String((await this.document(id))!.revision);
			});
		},
		async writeState(id: string, state: string) {
			const result = await db.run(
				"UPDATE kit_resource_draft_documents SET sdk_state_json=? WHERE draft_id=?",
				state,
				id,
			);
			if (!result.changes) throw new KitError("conflict", "发布批次已关闭");
		},
		async writeProof(id: string, proof: string) {
			const result = await db.run("UPDATE kit_resource_draft_documents SET proof_json=? WHERE draft_id=?", proof, id);
			if (!result.changes) throw new KitError("conflict", "发布批次已关闭");
		},
		async clearDocument(id: string) {
			await db.run("DELETE FROM kit_resource_draft_documents WHERE draft_id=?", id);
		},
		async begin(id: string, revision: string) {
			const result = await db.run(
				"UPDATE kit_resource_drafts SET status='publishing',phase='executing',expected_revision=?,updated_at=? WHERE draft_id=? AND phase='editable' AND status!='published'",
				revision,
				new Date().toISOString(),
				id,
			);
			if (!result.changes) throw new KitError("conflict", "此发布批次已完成或结果待核对，不能再次发布");
		},
		async fail(id: string, retryable: boolean) {
			await db.run(
				"UPDATE kit_resource_drafts SET status='failed',phase=?,updated_at=? WHERE draft_id=? AND status!='published'",
				retryable ? "editable" : "uncertain",
				new Date().toISOString(),
				id,
			);
		},
		async receipt(id: string, resources: ResourceDraftPublishedBinding[]) {
			await db.run(
				"UPDATE kit_resource_drafts SET status='published',phase='succeeded',resources_json=?,cleanup_pending=1,updated_at=? WHERE draft_id=?",
				JSON.stringify(resources),
				new Date().toISOString(),
				id,
			);
		},
		async cleaned(id: string) {
			await db.run(
				"UPDATE kit_resource_drafts SET cleanup_pending=0,updated_at=? WHERE draft_id=? AND status='published'",
				new Date().toISOString(),
				id,
			);
		},
		async discard(id: string, owner: string) {
			const result = await db.run(
				"DELETE FROM kit_resource_drafts WHERE draft_id=? AND owner=? AND phase='editable' AND status!='published'",
				id,
				owner,
			);
			if (!result.changes) throw new KitError("conflict", "批次状态已变化，不能丢弃");
		},
	};
}
export type ResourceDraftStore = ReturnType<typeof createResourceDraftStore>;
