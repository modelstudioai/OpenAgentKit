import { join, resolve } from "node:path";
import { KitError, type PublicationReport } from "@openagentkit/sdk/protocol";
import type { ProjectExecutionPlan, ProviderGateway, ResourceDraftGateway } from "../gateway/types.ts";
import { initialDraftYaml } from "../gateway/yaml-draft-document.ts";
import { PublicationError } from "../publication-error.ts";
import { createProjectFileUploads } from "../services/project-file-uploads.ts";
import { createProjectSkillUploads } from "../services/project-skill-uploads.ts";
import { requireInternalToken } from "./http.ts";

interface CallbackResult {
	data?: unknown;
	error?: { code?: string; message?: string; retryable?: boolean };
}

type DraftEntry = {
	gateway: ResourceDraftGateway;
	active?: { operationId: string; next: number; promise: Promise<void> };
};

const actions = [
	"agentOptions",
	"createAgent",
	"createEnvironment",
	"createVault",
	"createMemoryStore",
	"memoryStoreConfiguration",
	"overview",
	"declarations",
	"declaration",
	"declarationPreview",
	"putDeclaration",
	"deleteDeclaration",
	"resourceBindings",
	"resolveResourceBindings",
	"validate",
	"plan",
	"publicationBindings",
] as const satisfies ReadonlyArray<keyof ResourceDraftGateway>;

export function createDraftTransport(gateway: ProviderGateway, instance: string, maxUpload: number) {
	const port = Number(process.env.KIT_SDK_CALLBACK_PORT ?? 8792);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("KIT_SDK_CALLBACK_PORT 无效");
	const callbackUrl = `http://127.0.0.1:${port}/internal/sdk/v1`;
	const token = requireInternalToken("KIT_SDK_CALLBACK_TOKEN", process.env.KIT_SDK_CALLBACK_TOKEN);
	const root = resolve(process.env.KIT_SDK_ASSET_DIR ?? ".data/resource-draft-uploads");
	const entries = new Map<string, DraftEntry>();
	const fileUploads = createProjectFileUploads(maxUpload);
	const skillUploads = createProjectSkillUploads(maxUpload);

	async function callback<T>(path: string, data?: unknown): Promise<T> {
		const url = callbackUrl + path;
		const response = await fetch(url, {
			method: data === undefined ? "GET" : "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			...(data === undefined ? {} : { body: JSON.stringify(data) }),
			signal: AbortSignal.timeout(5000),
			redirect: "error",
		});
		const body = (await response.json()) as CallbackResult;
		if (!response.ok)
			throw new KitError(response.status >= 500 ? "provider_error" : "conflict", "Kit 发布账本拒绝回写", {
				status: response.status,
				retryable: response.status >= 500,
			});
		return body.data as T;
	}

	function checkDraft(id: unknown): string {
		if (typeof id !== "string" || !/^draft_[a-f0-9]{32}$/.test(id)) throw new KitError("not_found", "资源批次不存在");
		return id;
	}

	function active(entry: DraftEntry) {
		if (!entry.active) throw new KitError("conflict", "发布执行尚未认领");
		return entry.active;
	}

	function writeCheckpoint(entry: DraftEntry, kind: string, payload: unknown): Promise<void> {
		const worker = active(entry);
		const data = { instance, sequence: worker.next++, kind, payload };
		const next = worker.promise.then(async () => {
			const path = `/claims/${worker.operationId}/checkpoint`;
			for (let attempt = 0; ; attempt++) {
				try {
					await callback(path, data);
					return;
				} catch (error) {
					if (attempt >= 6 || (error instanceof KitError && !error.retryable)) throw error;
					await new Promise((accept) => setTimeout(accept, Math.min(2000, 150 * 2 ** attempt)));
				}
			}
		});
		worker.promise = next;
		return next;
	}

	function scoped(id: string) {
		let entry = entries.get(id);
		if (entry) return entry;
		if (entries.size >= 512) throw new KitError("conflict", "当前打开的资源批次过多，请先完成或丢弃批次");
		const reference: DraftEntry = {
			gateway: gateway.resourceDraftDocument(id, join(root, id), {
				read: () => callback(`/drafts/${id}/document`),
				write: (revision, yaml, assets) => callback(`/drafts/${id}/document`, { revision, yaml, assets }),
				writeState: (state) => writeCheckpoint(reference, "state", state),
			}),
		};
		entries.set(id, reference);
		entry = reference;
		return entry;
	}

	async function requireMatchingPlan(entry: DraftEntry, expected: ProjectExecutionPlan) {
		const check = await entry.gateway.plan();
		if (
			check.project_revision !== expected.project_revision ||
			check.fingerprint !== expected.fingerprint ||
			check.yaml_hash !== expected.yaml_hash
		) {
			throw new KitError("conflict", "批次或 SDK 计划已变化");
		}
		const required = (await entry.gateway.declarations()).map(({ type, id }) => ({ type, id }));
		if (!required.length) throw new KitError("invalid_request", "此批次没有需要发布的资源");
		const validation = await entry.gateway.validate();
		if (validation.warnings?.includes("project.skill.unreferenced")) {
			throw new KitError("invalid_request", "请先将上传的 Skill 加入智能体");
		}
		return required;
	}

	function failure(error: unknown, phase: "plan" | "execute" | "bindings", report?: PublicationReport) {
		const publicationError = error instanceof PublicationError ? error.errorDetails : null;
		const mutationStarted = publicationError?.mutation_started ?? phase !== "plan";
		return {
			error_details: publicationError ?? {
				code: phase === "bindings" ? "publication.result_unavailable" : "publication.interrupted",
				phase,
				retryable: false,
				mutation_started: mutationStarted,
			},
			publication: report ?? {
				outcome: mutationStarted ? "unknown" : "failed",
				mutation_started: mutationStarted,
				resources: [],
			},
		};
	}

	async function execute(id: string, entry: DraftEntry, expected: ProjectExecutionPlan) {
		const worker = active(entry);
		let phase: "plan" | "execute" | "bindings" = "plan";
		let report: PublicationReport | undefined;
		try {
			const required = await requireMatchingPlan(entry, expected);
			await callback(`/claims/${worker.operationId}/grant`, { instance });
			phase = "execute";
			const result = await entry.gateway.execute(expected, {
				log() {},
				progress() {},
				async publication(value) {
					report = value;
					await writeCheckpoint(entry, "report", value);
				},
			});
			phase = "bindings";
			await writeCheckpoint(entry, "proof", { required, project_revision: expected.project_revision });
			const bindings = await entry.gateway.publicationBindings();
			await writeCheckpoint(entry, "result", { result, bindings });
			entry.gateway.clearSecrets();
			entries.delete(id);
		} catch (error) {
			await writeCheckpoint(entry, "failure", failure(error, phase, report)).catch(() => undefined);
		} finally {
			entry.active = undefined;
		}
	}

	const draftMethods = new Map<string, (...args: unknown[]) => unknown>();
	draftMethods.set("draftInitial", () => initialDraftYaml);
	draftMethods.set("draftActive", (raw, operation) => {
		const id = checkDraft(raw);
		return { active: entries.get(id)?.active?.operationId === operation };
	});
	draftMethods.set("draftInvoke", async (raw, action, args) => {
		const id = checkDraft(raw);
		const method = actions.find((name) => name === action);
		if (!method || !Array.isArray(args)) throw new KitError("invalid_request", "资源批次动作无效");
		const document = scoped(id).gateway;
		return (document[method].bind(document) as (...input: unknown[]) => unknown)(...args);
	});
	draftMethods.set("draftRelease", (raw) => {
		const id = checkDraft(raw);
		const entry = entries.get(id);
		if (entry?.active) throw new KitError("conflict", "发布正在执行");
		entry?.gateway.clearSecrets();
		entries.delete(id);
		return true;
	});
	draftMethods.set("draftExecute", async (raw, operation) => {
		const id = checkDraft(raw);
		if (typeof operation !== "string" || !/^op_[a-f0-9-]{36}$/.test(operation)) {
			throw new KitError("invalid_request", "Operation 标识无效");
		}
		const entry = scoped(id);
		if (entry.active) throw new KitError("conflict", "批次正在执行");
		entry.active = { operationId: operation, next: 1, promise: Promise.resolve() };
		try {
			const expected = await callback<ProjectExecutionPlan>(`/claims/${operation}/claim`, { instance, draft_id: id });
			void execute(id, entry, expected);
			return { accepted: true };
		} catch (error) {
			entry.active = undefined;
			throw error;
		}
	});
	draftMethods.set("draftStage", async (raw, subject, revision, kind, name, content) => {
		const id = checkDraft(raw);
		if (
			typeof subject !== "string" ||
			typeof revision !== "string" ||
			typeof name !== "string" ||
			typeof content !== "string"
		) {
			throw new KitError("invalid_request", "上传参数无效");
		}
		const scope = { name: id, subject, baseRevision: revision };
		const bytes = Buffer.from(content, "base64");
		if (kind === "skill") return skillUploads.stage(scope, name, bytes);
		if (kind === "file") return fileUploads.stage(scope, name, bytes);
		throw new KitError("invalid_request", "上传类型无效");
	});
	draftMethods.set("draftCancelUpload", (raw, subject, kind, uploadId) => {
		const id = checkDraft(raw);
		if (typeof subject !== "string" || typeof uploadId !== "string")
			throw new KitError("invalid_request", "上传参数无效");
		return (kind === "skill" ? skillUploads : fileUploads).cancel({ name: id, subject }, uploadId);
	});
	draftMethods.set("draftUploads", async (raw, subject, kind, commit, request) => {
		const id = checkDraft(raw);
		const input = request as { base_revision: string; upload_ids: string[] };
		if (
			typeof subject !== "string" ||
			!input ||
			!Array.isArray(input.upload_ids) ||
			typeof input.base_revision !== "string"
		)
			throw new KitError("invalid_request", "上传参数无效");
		const scope = { name: id, subject, baseRevision: input.base_revision };
		const document = scoped(id).gateway;
		if (kind === "skill") {
			if (!commit) return document.previewSkillUploads(input, skillUploads.resolve(scope, input.upload_ids));
			const claim = skillUploads.claim(scope, input.upload_ids);
			let saved = false;
			try {
				const result = await document.commitSkillUploads(input, claim.uploads);
				saved = true;
				return result;
			} finally {
				claim.finish(saved);
			}
		}
		if (!commit) return document.previewFileUploads(input, fileUploads.resolve(scope, input.upload_ids));
		const claim = fileUploads.claim(scope, input.upload_ids);
		let saved = false;
		try {
			const result = await document.commitFileUploads(input, claim.uploads);
			saved = true;
			return result;
		} finally {
			claim.finish(saved);
		}
	});
	return draftMethods;
}
