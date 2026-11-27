import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { KitError, type ProjectSkillUpload } from "@openagentkit/sdk/protocol";
import { inspectSkillSource } from "@openagentpack/sdk";
import JSZip from "jszip";
import type { ProjectSourceSkillUpload } from "../../../../gateway/types.ts";
import { ProjectFileUploads, type ProjectUploadOwner, type ProjectUploadScope } from "./project-file-uploads.ts";

type SourceFile = { path: string; bytes: Uint8Array };
const MAX_SKILL_FILE_BYTES = 8 * 1024 * 1024;
const invalid = (message: string) => new KitError("invalid_request", message);

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 32;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 32 * 1024 * 1024;
interface Entry {
	owner: ProjectUploadOwner;
	upload: ProjectSourceSkillUpload;
	expiresAt: number;
	claimed: boolean;
}

function sameScope(left: ProjectUploadScope, right: ProjectUploadScope): boolean {
	return left.subject === right.subject && left.name === right.name;
}

/** 仅驻内存；原始包和展开后的文件一并计费。解析中的请求预留展开上限，避免并发解压越界。 */
export class ProjectSkillUploads {
	/** 通过公开 ZIP 流接口限量解包；在 SDK 检查前就限制路径、文件类型和实际解压量。 */
	static async prepare(filename: string, bytes: Uint8Array) {
		ProjectFileUploads.assertFileName(filename);
		if (!bytes.length || bytes.length > MAX_EXPANDED_BYTES) throw invalid("Skill 上传文件为空或超过 32 MiB");
		let files: SourceFile[];
		if (filename.toLowerCase() === "skill.md") {
			if (bytes.length > MAX_SKILL_FILE_BYTES) throw invalid("SKILL.md 不能超过 8 MiB");
			files = [{ path: "SKILL.md", bytes: new Uint8Array(bytes) }];
		} else if (filename.toLowerCase().endsWith(".zip")) {
			files = await unpackSkill(bytes);
		} else throw invalid("请上传 ZIP 压缩包或单个 SKILL.md");
		const temporary = await mkdtemp(resolve(tmpdir(), "kit-skill-source-"));
		try {
			await writeSkillFiles(temporary, files);
			let name: string;
			try {
				name = (await inspectSkillSource(temporary)).name;
			} catch {
				throw invalid("SKILL.md 必须包含有效 YAML 头部和非空 name");
			}
			if (name.includes("${") || Buffer.byteLength(name, "utf8") > 240 || /\p{Cc}/u.test(name))
				throw invalid("Skill 名称无效，请检查 SKILL.md 的 name");
			return { name, files };
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	}

	static describe(upload: ProjectSourceSkillUpload): ProjectSkillUpload {
		return {
			upload_id: upload.upload_id,
			skill_key: upload.skill_key,
			filename: upload.filename,
			name: upload.name,
			size: upload.size,
			sha256: upload.sha256,
			file_count: upload.file_count,
			expanded_size: upload.expanded_size,
		};
	}

	private readonly entries;
	private totalBytes;
	private readonly maxFileBytes: number;
	private pending;
	private readonly now: () => number;

	constructor(maxFileBytes: number, now: () => number = Date.now) {
		this.maxFileBytes = maxFileBytes;
		this.now = now;
		this.entries = new Map<string, Entry>();
		this.totalBytes = 0;
		this.pending = 0;
	}

	clear() {
		this.entries.clear();
		this.totalBytes = 0;
	}

	async stage(owner: ProjectUploadOwner, filename: string, input: Uint8Array): Promise<ProjectSkillUpload> {
		if (input.byteLength === 0) throw new KitError("invalid_request", "不能上传空文件，请选择有内容的 Skill 包");
		if (input.byteLength > this.maxFileBytes) throw new KitError("invalid_request", "Skill 包大小超过上传上限");
		this.sweep();
		const reservation = input.byteLength + MAX_EXPANDED_BYTES;
		if (this.entries.size + this.pending >= MAX_ENTRIES || this.totalBytes + reservation > MAX_TOTAL_BYTES)
			throw new KitError("conflict", "暂存 Skill 已达到 32 项或 128 MiB 上限，请移除暂存包或稍后重试");
		this.pending++;
		this.totalBytes += reservation;
		try {
			const bytes = input.slice();
			const prepared = await ProjectSkillUploads.prepare(filename, bytes);
			const upload: ProjectSourceSkillUpload = {
				upload_id: `upload-${randomUUID()}`,
				skill_key: `skill-${randomUUID()}`,
				filename,
				name: prepared.name,
				size: bytes.byteLength,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				file_count: prepared.files.length,
				expanded_size: prepared.files.reduce((sum, file) => sum + file.bytes.byteLength, 0),
				bytes,
				files: prepared.files,
			};
			this.entries.set(upload.upload_id, {
				owner: { ...owner },
				upload,
				expiresAt: this.now() + TTL_MS,
				claimed: false,
			});
			this.totalBytes += upload.size + upload.expanded_size;
			return ProjectSkillUploads.describe(upload);
		} finally {
			this.pending--;
			this.totalBytes -= reservation;
		}
	}

	resolve(owner: ProjectUploadOwner, ids: string[]): ProjectSourceSkillUpload[] {
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
		if (!sameScope(entry.owner, scope)) throw new KitError("not_found", "暂存 Skill 不存在");
		if (entry.claimed) throw new KitError("conflict", "暂存 Skill 正在保存，暂时不能移除");
		return { deleted: this.remove(id) };
	}

	private remove(id: string): boolean {
		const entry = this.entries.get(id);
		if (!entry) return false;
		this.totalBytes -= entry.upload.size + entry.upload.expanded_size;
		return this.entries.delete(id);
	}

	private sweep() {
		for (const [id, entry] of this.entries) if (!entry.claimed && entry.expiresAt <= this.now()) this.remove(id);
	}

	private selected(owner: ProjectUploadOwner, ids: string[]): Entry[] {
		this.sweep();
		if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length)
			throw new KitError("invalid_request", "每次最多保存 20 个 Skill，上传标识不能重复");
		return ids.map((id) => {
			const entry = this.entries.get(id);
			if (!entry || !sameScope(entry.owner, owner))
				throw new KitError("not_found", "暂存 Skill 不存在或已过期，请重新选择文件");
			if (entry.owner.baseRevision !== owner.baseRevision)
				throw new KitError("conflict", "暂存 Skill 对应的项目版本已变化，请重新加载后选择文件");
			if (entry.claimed) throw new KitError("conflict", "暂存 Skill 正在保存，请等待当前操作完成");
			return entry;
		});
	}
}

async function unpackSkill(bytes: Uint8Array): Promise<SourceFile[]> {
	const originalPaths = inspectSkillZipDirectory(bytes);
	let zip: JSZip;
	try {
		// checkCRC32 会先无界解压，因此仅使用下面有字节上限的流读取。
		zip = await JSZip.loadAsync(bytes, { createFolders: false });
	} catch {
		throw invalid("ZIP 格式无效或不受支持");
	}
	const entries = Object.values(zip.files);
	if (
		entries.length !== originalPaths.size ||
		entries.some((entry) => !originalPaths.has(entry.unsafeOriginalName ?? entry.name))
	)
		throw invalid("ZIP 文件路径解析不一致");
	if (entries.length > 1000) throw invalid("ZIP 目录项过多");
	const files: SourceFile[] = [];
	let total = 0;
	const paths = new Set<string>();
	for (const entry of entries) {
		assertZipEntry(entry);
		if (entry.dir) continue;
		if (files.length >= 200) throw invalid("每个 Skill 最多包含 200 个文件");
		const folded = entry.name.normalize("NFC").toLowerCase();
		if (paths.has(folded)) throw invalid("ZIP 含重复文件路径");
		paths.add(folded);
		const content = await readZipEntry(entry, Math.min(MAX_SKILL_FILE_BYTES, MAX_EXPANDED_BYTES - total));
		total += content.length;
		files.push({ path: entry.name, bytes: content });
	}
	return normalizeRoot(files);
}

function assertZipEntry(entry: JSZip.JSZipObject) {
	const original = entry.unsafeOriginalName ?? entry.name;
	assertSkillPath(original.replace(/\/$/, ""));
	if (original !== entry.name) throw invalid("ZIP 含不安全路径");
	const permissions =
		typeof entry.unixPermissions === "string" ? Number.parseInt(entry.unixPermissions, 8) : entry.unixPermissions;
	const kind = (permissions ?? 0) & 0o170000;
	if (kind && kind !== (entry.dir ? 0o040000 : 0o100000)) throw invalid("ZIP 仅支持普通文件和目录，不能包含符号链接");
}

async function readZipEntry(entry: JSZip.JSZipObject, limit: number): Promise<Buffer> {
	const stream = new Readable().wrap(entry.nodeStream("nodebuffer"));
	const chunks: Buffer[] = [];
	let size = 0;
	try {
		for await (const chunk of stream) {
			const buffer = Buffer.from(chunk);
			size += buffer.length;
			if (size > limit) {
				stream.destroy();
				throw invalid("Skill 解压后单文件不能超过 8 MiB，总大小不能超过 32 MiB");
			}
			chunks.push(buffer);
		}
	} catch (error) {
		if (error instanceof KitError) throw error;
		throw invalid("ZIP 文件内容无效");
	}
	return Buffer.concat(chunks);
}

function assertSkillPath(path: string) {
	if (!path || path.includes(":") || Buffer.byteLength(path, "utf8") > 1024 || path.split("/").length > 16)
		throw invalid("ZIP 文件路径无效");
	for (const part of path.split("/")) ProjectFileUploads.assertFileName(part);
}

function normalizeRoot(files: SourceFile[]): SourceFile[] {
	const prefix = files.some((file) => file.path === "SKILL.md") ? "" : `${files[0]?.path.split("/")[0]}/`;
	if (!files.some((file) => file.path === `${prefix}SKILL.md`) || files.some((file) => !file.path.startsWith(prefix)))
		throw invalid("每个 ZIP 必须包含一个 Skill：SKILL.md 位于根目录或单层包装目录");
	const normalized = files.map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
	if (normalized.some((file) => file.path.toLowerCase() === "skill.json"))
		throw invalid("ZIP 不能包含根目录 skill.json；资源声明由项目生成");
	if (normalized.some((file) => file.path !== "SKILL.md" && file.path.endsWith("/SKILL.md")))
		throw invalid("每个 ZIP 只能包含一个 Skill");
	const paths = new Set(normalized.map((file) => file.path.normalize("NFC").toLowerCase()));
	for (const file of normalized) {
		const parts = file.path.normalize("NFC").toLowerCase().split("/");
		for (let index = 1; index < parts.length; index++)
			if (paths.has(parts.slice(0, index).join("/"))) throw invalid("ZIP 文件与目录路径冲突");
	}
	return normalized.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

async function writeSkillFiles(directory: string, files: SourceFile[]) {
	for (const file of files) {
		const path = resolve(directory, file.path);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, file.bytes, { mode: 0o600, flag: "wx" });
	}
}

const malformed = () => new KitError("invalid_request", "ZIP 目录无效或格式不受支持");

/** 在解包库覆盖同名项之前检查原始中央目录；不实现压缩算法，也不读取库的私有字段。 */
function inspectSkillZipDirectory(bytes: Uint8Array): Set<string> {
	const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = findDirectoryEnd(buffer);
	const count = buffer.readUInt16LE(end + 10);
	const offset = buffer.readUInt32LE(end + 16);
	const length = buffer.readUInt32LE(end + 12);
	if (
		buffer.readUInt16LE(end + 4) !== 0 ||
		buffer.readUInt16LE(end + 6) !== 0 ||
		buffer.readUInt16LE(end + 8) !== count ||
		!count ||
		count > 1000 ||
		offset + length !== end
	)
		throw malformed();
	const names = new Set<string>();
	const folded = new Set<string>();
	let cursor = offset;
	for (let index = 0; index < count; index++) {
		const entry = readDirectoryEntry(buffer, cursor, end);
		const key = entry.name.normalize("NFC").toLowerCase();
		if (folded.has(key)) throw new KitError("invalid_request", "ZIP 含重复文件路径");
		folded.add(key);
		names.add(entry.name);
		cursor = entry.next;
	}
	if (cursor !== end) throw malformed();
	return names;
}

function findDirectoryEnd(buffer: Buffer): number {
	for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
		if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length)
			return offset;
	}
	throw malformed();
}

function readDirectoryEntry(buffer: Buffer, offset: number, end: number) {
	if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw malformed();
	const nameLength = buffer.readUInt16LE(offset + 28);
	const extraLength = buffer.readUInt16LE(offset + 30);
	const commentLength = buffer.readUInt16LE(offset + 32);
	const next = offset + 46 + nameLength + extraLength + commentLength;
	if (!nameLength || next > end || buffer.readUInt16LE(offset + 34) !== 0) throw malformed();
	const uncompressed = buffer.readUInt32LE(offset + 24);
	if (uncompressed > 8 * 1024 * 1024) throw new KitError("invalid_request", "Skill 解压后单文件不能超过 8 MiB");
	let name: string;
	try {
		name = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
	} catch {
		throw new KitError("invalid_request", "ZIP 文件名必须使用 UTF-8 编码");
	}
	return { name, next };
}
