import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
	KitError,
	type ProjectFileUpload,
	type ProjectFileUploadInput,
	type ProjectSkillUploadInput,
} from "@openagentkit/sdk/protocol";
import type { DraftAsset, DraftAssetStore } from "../../../../gateway/shared/resource-draft/asset-store.ts";
import type { ProjectSourceFileUpload, ProjectSourceSkillUpload } from "../../../../gateway/types.ts";
import { ProjectFileUploads } from "./project-file-uploads.ts";
import { ProjectSkillUploads } from "./project-skill-uploads.ts";

function sha256(value: string | Uint8Array) {
	return createHash("sha256").update(value).digest("hex");
}

async function ordinary(path: string, directory: boolean, create = false) {
	if (create) await mkdir(path, { recursive: true, mode: 0o700 });
	const info = await lstat(path);
	if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()))
		throw new KitError("conflict", "上传暂存路径不安全");
	return info;
}

function validateUploadIdentity(
	upload: ProjectSourceFileUpload,
	ids: string[],
	seen: Set<string>,
	keys: Set<string>,
	existingKeys: Set<string>,
) {
	if (
		!upload.upload_id ||
		!ids.includes(upload.upload_id) ||
		seen.has(upload.upload_id) ||
		upload.upload_id.length > 128
	)
		throw new KitError("invalid_request", "暂存文件与提交列表不一致");
	seen.add(upload.upload_id);
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(upload.file_key) || keys.has(upload.file_key))
		throw new KitError("invalid_request", "文件声明标识无效");
	keys.add(upload.file_key);
	if (existingKeys.has(upload.file_key)) throw new KitError("conflict", "资源声明标识已存在，请重新上传");
}

function validateFileContent(upload: ProjectSourceFileUpload) {
	ProjectFileUploads.assertFileName(upload.filename);
	if (
		upload.size !== upload.bytes.byteLength ||
		!Number.isSafeInteger(upload.size) ||
		upload.size <= 0 ||
		sha256(upload.bytes) !== upload.sha256
	)
		throw new KitError("invalid_request", "暂存文件内容校验失败，请重新上传");
}

async function validateSkillUploadContent(upload: ProjectSourceSkillUpload) {
	if (upload.size !== upload.bytes.byteLength || sha256(upload.bytes) !== upload.sha256)
		throw new KitError("invalid_request", "暂存 Skill 内容校验失败，请重新上传");
	const parsed = await ProjectSkillUploads.prepare(upload.filename, upload.bytes);
	if (
		parsed.name !== upload.name ||
		parsed.files.length !== upload.file_count ||
		parsed.files.length !== upload.files.length ||
		parsed.files.reduce((sum, file) => sum + file.bytes.length, 0) !== upload.expanded_size ||
		parsed.files.some(
			(file, index) =>
				file.path !== upload.files[index]?.path || !Buffer.from(file.bytes).equals(upload.files[index]!.bytes),
		)
	)
		throw new KitError("invalid_request", "暂存 Skill 内容校验失败，请重新上传");
}

/** 为一个批次复核并保存普通文件和 Skill 素材；版本化声明由调用方提交。 */
export class ResourceDraftAssets implements DraftAssetStore {
	constructor(private readonly root: string) {}

	validateFiles(
		input: ProjectFileUploadInput,
		uploads: ProjectSourceFileUpload[],
		existingKeys: Set<string>,
	): ProjectFileUpload[] {
		const ids = input.upload_ids;
		if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length || ids.length !== uploads.length)
			throw new KitError("invalid_request", "暂存文件列表无效");
		const seen = new Set<string>();
		const keys = new Set<string>();
		for (const upload of uploads) {
			validateUploadIdentity(upload, ids, seen, keys, existingKeys);
			validateFileContent(upload);
		}
		return uploads.map(ProjectFileUploads.describe);
	}

	async validateSkills(input: ProjectSkillUploadInput, uploads: ProjectSourceSkillUpload[], existingKeys: Set<string>) {
		if (
			!input.upload_ids.length ||
			input.upload_ids.length > 20 ||
			new Set(input.upload_ids).size !== input.upload_ids.length ||
			uploads.length !== input.upload_ids.length
		)
			throw new KitError("invalid_request", "暂存 Skill 列表无效");
		const ids = new Set<string>();
		const keys = new Set<string>();
		for (const upload of uploads) {
			if (
				!input.upload_ids.includes(upload.upload_id) ||
				ids.has(upload.upload_id) ||
				!upload.upload_id ||
				upload.upload_id.length > 128
			)
				throw new KitError("invalid_request", "暂存 Skill 与提交列表不一致");
			ids.add(upload.upload_id);
			if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(upload.skill_key) || keys.has(upload.skill_key))
				throw new KitError("invalid_request", "Skill 声明标识无效");
			keys.add(upload.skill_key);
			if (existingKeys.has(upload.skill_key)) throw new KitError("conflict", "资源声明标识已存在，请重新上传");
			await validateSkillUploadContent(upload);
		}
		return uploads.map(ProjectSkillUploads.describe);
	}

	async verifyHash(assets: DraftAsset[]) {
		for (const asset of assets) {
			const path = await this.assetPath(asset.path);
			const info = await ordinary(path, false);
			if (info.size !== asset.size || sha256(await readFile(path)) !== asset.sha256)
				throw new KitError("conflict", "上传暂存内容已变化，请重新上传并预览");
		}
		return sha256(JSON.stringify(assets));
	}

	async save(files: { path: string; bytes: Uint8Array }[]) {
		const written: string[] = [];
		const assets: DraftAsset[] = [];
		const rollback = async () => {
			await Promise.all(written.map((path) => rm(path, { force: true })));
		};
		try {
			for (const file of files) {
				const path = await this.assetPath(file.path, true);
				const handle = await open(path, "wx", 0o600);
				written.push(path);
				try {
					await handle.writeFile(file.bytes);
				} finally {
					await handle.close();
				}
				assets.push({ path: file.path, sha256: sha256(file.bytes), size: file.bytes.byteLength });
			}
			return { assets, rollback };
		} catch (error) {
			await rollback();
			throw error;
		}
	}

	private async assetPath(path: string, create = false) {
		const destination = resolve(this.root, path);
		const within = relative(this.root, destination);
		if (!within || within.startsWith("..") || isAbsolute(within)) throw new KitError("invalid_request", "上传路径无效");
		await ordinary(dirname(this.root), true, create);
		await ordinary(this.root, true, create);
		let parent = this.root;
		for (const part of relative(this.root, dirname(destination)).split(sep).filter(Boolean)) {
			parent = resolve(parent, part);
			await ordinary(parent, true, create);
		}
		return destination;
	}
}
