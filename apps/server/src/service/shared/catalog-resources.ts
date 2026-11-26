import { posix } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type AttachmentRef, type CatalogMemoryStore, KitError, type TemplateInput } from "@openagentkit/sdk/protocol";
import type { ProviderGateway } from "../../gateway/types.ts";
import { resolveMounts } from "../../utils/attachments.ts";
import { KIT_PROVIDER_GATEWAY } from "../../utils/injection-tokens.ts";

import type { CatalogEntryInput } from "./catalog.ts";

@Injectable()
export class CatalogResourceService {
	constructor(@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway) {}

	/** 模版编辑与上架共用同一配置投影；Provider 版本快照不能变成运行时锁定。 */
	catalogInputFromTemplate(template: TemplateInput, slug: string, displayName: string): CatalogEntryInput {
		return {
			slug,
			display_name: displayName,
			remote_agent_id: template.remote_agent_id,
			category: template.category,
			remote_environment_id: template.remote_environment_id ?? null,
			remote_agent_version: undefined,
			agent_version: template.agent_version ?? null,
			files: template.files,
			memory_stores: template.memory_stores,
			vault_ids: template.vault_ids,
			description: template.description,
			opening_remarks: template.opening_remarks,
			suggested_prompts: template.suggested_prompts,
		};
	}

	explicitMountPath(value: string | undefined): string | undefined {
		const path = value?.trim();
		if (!path) return undefined;
		const hasControl = /\p{Cc}/u.test(path);
		if (!path.startsWith("/") || path.endsWith("/") || hasControl || path.split("/").includes("..")) {
			throw new KitError("invalid_request", "挂载路径必须是绝对文件路径，且不能包含 .. 或控制字符");
		}
		const normalized = posix.normalize(path);
		if (normalized === "/") throw new KitError("invalid_request", "挂载路径必须包含文件名");
		return normalized;
	}

	/** 目录资源均由管理员配置并经 Provider 元数据校验；省略的字段不覆盖已保存配置。 */
	async prepare<
		T extends {
			remote_agent_id?: string;
			agent_version?: number | null;
			files?: AttachmentRef[];
			memory_stores?: CatalogMemoryStore[];
			vault_ids?: string[];
		},
	>(input: T): Promise<T> {
		if (input.agent_version != null) {
			if (!input.remote_agent_id) throw new KitError("invalid_request", "选择智能体版本时必须指定智能体");
			const agent = await this.gateway.getRemoteAgentVersion(input.remote_agent_id, input.agent_version);
			if (!agent) throw new KitError("invalid_request", "所选智能体版本不存在或已不可用，请返回第一步重新选择");
		}
		return {
			...input,
			...(input.files ? { files: await this.prepareFiles(input.files) } : {}),
			...(input.memory_stores ? { memory_stores: await this.prepareMemoryStores(input.memory_stores) } : {}),
			...(input.vault_ids ? { vault_ids: await this.prepareVaults(input.vault_ids) } : {}),
		};
	}

	/** 管理员提交 ID 与路径，文件名和大小由 Provider 校准；目录配置是共享挂载的服务端白名单。 */
	private async prepareFiles(input: AttachmentRef[]): Promise<AttachmentRef[]> {
		if (input.length > 10) throw new KitError("invalid_request", "最多选择 10 个文件");
		const ids = new Set<string>();
		const paths = new Set<string>();
		const files: AttachmentRef[] = [];
		for (const file of input) {
			if (!file.file_id.trim()) throw new KitError("invalid_request", "请选择已上传文件");
			if (ids.has(file.file_id)) throw new KitError("invalid_request", "同一文件不能重复选择");
			ids.add(file.file_id);
			const remote = await this.gateway.getRemoteFile(file.file_id);
			if (!remote) throw new KitError("invalid_request", "所选文件不存在或不是已上传文件，请重新选择");
			if (!remote.available) throw new KitError("conflict", "所选文件尚不可用，请刷新文件列表后重试");
			const canonical: AttachmentRef = { file_id: remote.file_id, filename: remote.filename, size: remote.size };
			const mountPath = this.explicitMountPath(file.mount_path) ?? resolveMounts([canonical])[0]?.mount_path;
			if (!mountPath) throw new KitError("invalid_request", "无法确定文件挂载路径");
			if (paths.has(mountPath)) throw new KitError("invalid_request", "文件挂载路径不能重复");
			paths.add(mountPath);
			files.push({ ...canonical, mount_path: mountPath });
		}
		return files;
	}

	private async prepareMemoryStores(input: CatalogMemoryStore[]): Promise<CatalogMemoryStore[]> {
		if (input.length > 8) throw new KitError("invalid_request", "最多选择 8 个记忆库");
		const ids = new Set<string>();
		const result: CatalogMemoryStore[] = [];
		for (const resource of input) {
			const id = resource.memory_store_id.trim();
			if (ids.has(id)) throw new KitError("invalid_request", "同一记忆库不能重复选择");
			ids.add(id);
			const store = await this.gateway.getRemoteMemoryStore(id);
			if (!store) throw new KitError("invalid_request", "所选记忆库不存在或已归档，请重新选择");
			const instructions = resource.instructions?.trim();
			result.push({
				memory_store_id: store.memory_store_id,
				access: resource.access,
				...(instructions ? { instructions } : {}),
			});
		}
		return result;
	}

	private async prepareVaults(input: string[]): Promise<string[]> {
		if (input.length > 10) throw new KitError("invalid_request", "最多选择 10 个密钥库");
		const ids = new Set<string>();
		const result: string[] = [];
		for (const value of input) {
			const id = value.trim();
			if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new KitError("invalid_request", "密钥库 ID 格式无效");
			if (ids.has(id)) throw new KitError("invalid_request", "同一密钥库不能重复选择");
			ids.add(id);
			const vault = await this.gateway.getRemoteVault(id);
			if (!vault) throw new KitError("invalid_request", "所选密钥库不存在或已归档，请重新选择");
			result.push(vault.vault_id);
		}
		return result;
	}
}
