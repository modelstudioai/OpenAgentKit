import { createHash, randomUUID } from "node:crypto";
import { KitError, type ProjectFileUpload } from "@openagentkit/sdk/protocol";
import type { ProjectSourceFileUpload } from "../../../../gateway/types.ts";

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 32;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;

export interface ProjectUploadScope {
	subject: string;
	name: string;
}
export interface ProjectUploadOwner extends ProjectUploadScope {
	baseRevision: string;
}
interface Entry {
	owner: ProjectUploadOwner;
	upload: ProjectSourceFileUpload;
	expiresAt: number;
	claimed: boolean;
}

function sameScope(left: ProjectUploadScope, right: ProjectUploadScope): boolean {
	return left.subject === right.subject && left.name === right.name;
}

/** 暂存仅驻内存，不写项目/SQLite/Provider；重启后旧 token 失效，用户可重新选择文件。 */
export class ProjectFileUploads {
	static assertFileName(filename: string) {
		const controlCharacter = /\p{Cc}/u.test(filename);
		if (
			!filename ||
			Buffer.byteLength(filename, "utf8") > 240 ||
			/[\\/]/.test(filename) ||
			controlCharacter ||
			filename.startsWith(".") ||
			filename.endsWith(".") ||
			filename.includes("${") ||
			filename.trim() !== filename
		)
			throw new KitError("invalid_request", "文件名无效，请使用普通文件名");
	}

	static describe(upload: ProjectSourceFileUpload): ProjectFileUpload {
		return {
			upload_id: upload.upload_id,
			file_key: upload.file_key,
			filename: upload.filename,
			size: upload.size,
			sha256: upload.sha256,
		};
	}

	private readonly entries;
	private totalBytes;
	private readonly maxFileBytes: number;
	private readonly now: () => number;

	constructor(maxFileBytes: number, now: () => number = Date.now) {
		this.maxFileBytes = maxFileBytes;
		this.now = now;
		this.entries = new Map<string, Entry>();
		this.totalBytes = 0;
	}

	clear() {
		this.entries.clear();
		this.totalBytes = 0;
	}

	stage(owner: ProjectUploadOwner, filename: string, bytes: Uint8Array): ProjectFileUpload {
		ProjectFileUploads.assertFileName(filename);
		if (bytes.byteLength === 0) throw new KitError("invalid_request", "不能上传空文件，请选择有内容的文件");
		if (bytes.byteLength > this.maxFileBytes) throw new KitError("invalid_request", "文件大小超过上传上限");
		this.sweep();
		if (this.entries.size >= MAX_ENTRIES || this.totalBytes + bytes.byteLength > MAX_TOTAL_BYTES)
			throw new KitError("conflict", "暂存文件已达到 32 项或 128 MiB 上限，请先移除暂存文件，或等待 30 分钟后重试");
		const upload: ProjectSourceFileUpload = {
			upload_id: `upload-${randomUUID()}`,
			file_key: `file-${randomUUID()}`,
			filename,
			size: bytes.byteLength,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			bytes: bytes.slice(),
		};
		this.entries.set(upload.upload_id, { owner: { ...owner }, upload, expiresAt: this.now() + TTL_MS, claimed: false });
		this.totalBytes += upload.size;
		return ProjectFileUploads.describe(upload);
	}

	resolve(owner: ProjectUploadOwner, ids: string[]): ProjectSourceFileUpload[] {
		return this.selected(owner, ids).map((entry) => entry.upload);
	}

	claim(owner: ProjectUploadOwner, ids: string[]) {
		const chosen = this.selected(owner, ids);
		for (const entry of chosen) entry.claimed = true;
		let finished = false;
		return {
			uploads: chosen.map((entry) => entry.upload),
			finish: (committed: boolean) => {
				if (finished) return;
				finished = true;
				for (const entry of chosen) {
					if (committed) this.remove(entry.upload.upload_id);
					else {
						entry.claimed = false;
						entry.expiresAt = this.now() + TTL_MS;
					}
				}
			},
		};
	}

	cancel(scope: ProjectUploadScope, id: string): { deleted: boolean } {
		this.sweep();
		const entry = this.entries.get(id);
		if (!entry) return { deleted: false };
		if (!sameScope(entry.owner, scope)) throw new KitError("not_found", "暂存文件不存在");
		if (entry.claimed) throw new KitError("conflict", "暂存文件正在保存，暂时不能移除");
		return { deleted: this.remove(id) };
	}

	private remove(id: string): boolean {
		const entry = this.entries.get(id);
		if (!entry) return false;
		this.totalBytes -= entry.upload.size;
		return this.entries.delete(id);
	}

	private sweep() {
		for (const [id, entry] of this.entries) if (!entry.claimed && entry.expiresAt <= this.now()) this.remove(id);
	}

	private selected(owner: ProjectUploadOwner, ids: string[]): Entry[] {
		this.sweep();
		if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length)
			throw new KitError("invalid_request", "每次最多保存 20 个文件，上传标识不能重复");
		return ids.map((id) => {
			const entry = this.entries.get(id);
			if (!entry || !sameScope(entry.owner, owner))
				throw new KitError("not_found", "暂存文件不存在或已过期，请重新选择文件");
			if (entry.owner.baseRevision !== owner.baseRevision)
				throw new KitError("conflict", "暂存文件对应的项目版本已变化，请重新加载后选择文件");
			if (entry.claimed) throw new KitError("conflict", "暂存文件正在保存，请等待当前操作完成");
			return entry;
		});
	}
}
