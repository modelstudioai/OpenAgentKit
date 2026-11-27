import type { ProjectFileUploadInput, ProjectSkillUploadInput } from "@openagentkit/sdk/protocol";
import type { ProjectSourceFileUpload, ProjectSourceSkillUpload } from "../../types.ts";
import type { DraftAssetStore } from "./asset-store.ts";
import type { YamlDraftDocument } from "./yaml-draft-document.ts";

export function createYamlDraftUploads(doc: YamlDraftDocument, assets: DraftAssetStore) {
	const keys = async () =>
		new Set(
			Object.values((await doc.snapshot()).raw).flatMap((section) =>
				section && typeof section === "object" && !Array.isArray(section) ? Object.keys(section) : [],
			),
		);
	async function filePreview(input: ProjectFileUploadInput, uploads: ProjectSourceFileUpload[]) {
		await doc.assertRevision(input.base_revision);
		const files = assets.validateFiles(input, uploads, await keys());
		return {
			base_revision: input.base_revision,
			before: "{}",
			after: JSON.stringify(files),
			diagnostics: [],
			can_commit: true,
			file_uploads: files,
		};
	}
	async function skillPreview(input: ProjectSkillUploadInput, uploads: ProjectSourceSkillUpload[]) {
		await doc.assertRevision(input.base_revision);
		const skills = await assets.validateSkills(input, uploads, await keys());
		return {
			base_revision: input.base_revision,
			before: "{}",
			after: JSON.stringify(skills),
			diagnostics: [],
			can_commit: true,
			skill_uploads: skills,
		};
	}
	return {
		filePreview,
		skillPreview,
		async fileCommit(input: ProjectFileUploadInput, uploads: ProjectSourceFileUpload[]) {
			const preview = await filePreview(input, uploads);
			const current = await doc.snapshot();
			const saved = await assets.save(
				uploads.map((file) => ({ path: `${file.file_key}/${file.filename}`, bytes: file.bytes })),
			);
			try {
				current.raw.files ??= {};
				for (const file of uploads)
					current.raw.files[file.file_key] = { source: `${file.file_key}/${file.filename}`, purpose: "assistant" };
				const new_revision = await doc.commit(input.base_revision, current.raw, [...current.assets, ...saved.assets]);
				return { new_revision, files: preview.file_uploads };
			} catch (error) {
				await saved.rollback();
				throw error;
			}
		},
		async skillCommit(input: ProjectSkillUploadInput, uploads: ProjectSourceSkillUpload[]) {
			const preview = await skillPreview(input, uploads);
			const current = await doc.snapshot();
			const saved = await assets.save(
				uploads.flatMap((skill) =>
					skill.files.map((file) => ({ path: `${skill.skill_key}/${file.path}`, bytes: file.bytes })),
				),
			);
			try {
				current.raw.skills ??= {};
				for (const skill of uploads)
					current.raw.skills[skill.skill_key] = { name: skill.name, source: skill.skill_key, origin: "custom" };
				const new_revision = await doc.commit(input.base_revision, current.raw, [...current.assets, ...saved.assets]);
				return { new_revision, skills: preview.skill_uploads };
			} catch (error) {
				await saved.rollback();
				throw error;
			}
		},
	};
}
