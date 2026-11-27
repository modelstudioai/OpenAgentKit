import type {
	ProjectFileUpload,
	ProjectFileUploadInput,
	ProjectSkillUpload,
	ProjectSkillUploadInput,
} from "@openagentkit/sdk/protocol";
import type { ProjectSourceFileUpload, ProjectSourceSkillUpload } from "../../types.ts";

export interface DraftAsset {
	path: string;
	sha256: string;
	size: number;
}

/** 绑定到单一发布批次；素材校验、字节读写和回滚由 Kit 提供。 */
export interface DraftAssetStore {
	validateFiles(
		input: ProjectFileUploadInput,
		uploads: ProjectSourceFileUpload[],
		existingKeys: Set<string>,
	): ProjectFileUpload[];
	validateSkills(
		input: ProjectSkillUploadInput,
		uploads: ProjectSourceSkillUpload[],
		existingKeys: Set<string>,
	): Promise<ProjectSkillUpload[]>;
	save(files: { path: string; bytes: Uint8Array }[]): Promise<{ assets: DraftAsset[]; rollback(): Promise<void> }>;
	verifyHash(assets: DraftAsset[]): Promise<string>;
}

export type CreateDraftAssetStore = (assetRoot: string) => DraftAssetStore;
