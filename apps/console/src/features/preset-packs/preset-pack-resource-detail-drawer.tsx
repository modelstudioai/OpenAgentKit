import type {
	MemoryStoreConfiguration,
	RemoteEnvironmentDetail,
	RemoteFile,
	RemoteVaultDetail,
} from "@openagentpack/kit-sdk/protocol";
import { Alert, Button, Descriptions, Drawer, Result, Spin } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminApi, getAdminClient } from "../../lib/api.ts";
import { EnvironmentDetailView } from "../templates/environment-detail-view.tsx";
import { TemplateMemoryEntryList } from "../templates/template-memory-entry-list.tsx";
import { TemplateVaultDetailView } from "../templates/template-vault-detail-drawer.tsx";
import {
	loadPresetPackMemoryConfiguration,
	type PresetPackMemoryConfiguration,
} from "./preset-pack-memory-configuration.ts";
import type { PresetPackResourceRow } from "./preset-pack-resource-groups.ts";
import { presetPackResourceSelectionLimit } from "./preset-pack-resource-selection.ts";

const resourceLabels: Record<string, "types.environment" | "types.file" | "types.memoryStore" | "types.vault"> = {
	environment: "types.environment",
	file: "types.file",
	memory_store: "types.memoryStore",
	vault: "types.vault",
};
type Configuration =
	| { type: "environment"; detail: RemoteEnvironmentDetail }
	| { type: "file"; detail: RemoteFile }
	| { type: "memory_store"; detail: PresetPackMemoryConfiguration }
	| { type: "vault"; detail: RemoteVaultDetail };

export interface PresetPackResourceTarget {
	type: string;
	resource: PresetPackResourceRow;
}

function useResourceConfiguration(target: PresetPackResourceTarget, enabled: boolean) {
	const { t } = useTranslation("presetPacks");
	const client = useMemo(getAdminClient, []);
	const { type, resource } = target;
	return useAdminQuery<Configuration>(
		`preset-pack-configuration:${type}:${resource.key}`,
		async (signal) => {
			const id = resource.id;
			if (!id) throw new Error(t("detail.errNoId"));
			switch (type) {
				case "environment":
					return { type, detail: await client.remoteEnvironment(id, signal) };
				case "memory_store":
					return {
						type,
						detail: await loadPresetPackMemoryConfiguration(
							id,
							signal,
							client.remoteMemoryStoreConfiguration,
							adminApi.remoteMemoryStores,
							t("detail.errStoreGone"),
						),
					};
				case "vault":
					return { type, detail: await client.remoteVault(id, signal) };
				case "file": {
					const detail = (await adminApi.remoteFiles(signal)).find((file) => file.file_id === id);
					if (!detail) throw new Error(t("detail.errFileGone"));
					if (!detail.available) throw new Error(t("detail.errFileUnavailable"));
					return { type, detail };
				}
				default:
					throw new Error(t("detail.errUnsupportedType"));
			}
		},
		{ enabled },
	);
}

function ResourceBindings({ resource }: { resource: PresetPackResourceRow }) {
	const { t } = useTranslation("presetPacks");
	return (
		<Descriptions
			column={1}
			size="small"
			items={[
				{ key: "id", label: t("detail.resourceId"), children: resource.id || "—" },
				{ key: "mount", label: t("detail.mountPaths"), children: resource.mountPaths.join(t("joinComma")) || "—" },
				{
					key: "access",
					label: t("detail.access"),
					children:
						resource.accesses
							.map((access) => (access === "read_only" ? t("detail.readOnly") : t("detail.readWrite")))
							.join(t("joinComma")) || "—",
				},
				{
					key: "source",
					label: t("detail.source"),
					children: resource.sources
						.map((source) => (source === "runtime" ? t("detail.sourceRuntime") : t("detail.sourceSession")))
						.join(t("joinComma")),
				},
			]}
		/>
	);
}

function MemoryConfiguration({ detail }: { detail: MemoryStoreConfiguration }) {
	const { t } = useTranslation("presetPacks");
	return (
		<div className="space-y-4">
			<Descriptions
				column={1}
				size="small"
				items={[
					{ key: "name", label: t("detail.name"), children: detail.name },
					{
						key: "description",
						label: t("detail.description"),
						children: detail.description || t("detail.notConfigured"),
					},
				]}
			/>
			<section aria-label={t("detail.entriesAria")} className="space-y-4">
				<h3 className="text-sm font-medium">{t("detail.entriesTitle", { count: detail.entries.length })}</h3>
				<TemplateMemoryEntryList value={detail.entries.map((entry) => ({ ...entry, id: entry.key }))} />
			</section>
			{detail.copy_restricted_fields?.length ? (
				<Alert
					type="info"
					showIcon
					title={t("detail.restrictedTitle")}
					description={detail.copy_restricted_fields.join(t("joinComma"))}
				/>
			) : null}
		</div>
	);
}

function ConfigurationView({ configuration, onRetry }: { configuration: Configuration; onRetry: () => void }) {
	const { t } = useTranslation("presetPacks");
	switch (configuration.type) {
		case "environment":
			return <EnvironmentDetailView detail={configuration.detail} />;
		case "vault":
			return <TemplateVaultDetailView detail={configuration.detail} />;
		case "memory_store":
			return configuration.detail.kind === "complete" ? (
				<MemoryConfiguration detail={configuration.detail.configuration} />
			) : (
				<div className="space-y-4">
					<Descriptions
						column={1}
						size="small"
						items={[{ key: "name", label: t("detail.name"), children: configuration.detail.store.name }]}
					/>
					<Alert
						type="warning"
						showIcon
						title={t("detail.incompleteTitle")}
						description={t("detail.incompleteDesc")}
						action={<Button onClick={onRetry}>{t("detail.incompleteRetry")}</Button>}
					/>
				</div>
			);
		case "file":
			return (
				<Descriptions
					column={1}
					size="small"
					items={[
						{ key: "filename", label: t("detail.fileName"), children: configuration.detail.filename },
						{
							key: "size",
							label: t("detail.fileSize"),
							children:
								configuration.detail.size === undefined
									? "—"
									: t("detail.fileSizeValue", { size: configuration.detail.size.toLocaleString("zh-CN") }),
						},
						{
							key: "status",
							label: t("detail.status"),
							children: configuration.detail.status || t("detail.available"),
						},
					]}
				/>
			);
	}
}

function ResourceSelectionNotice({
	limit,
	selected,
	selectedCount,
	full,
	label,
}: {
	limit: number | undefined;
	selected: boolean;
	selectedCount: number;
	full: boolean;
	label: string;
}) {
	const { t } = useTranslation("presetPacks");
	if (limit === 1 && !selected && selectedCount > 0)
		return <Alert type="info" showIcon title={t("detail.envSingleNotice")} />;
	if (!full) return null;
	return <Alert type="warning" showIcon title={t("detail.limitNotice", { limit, label })} />;
}

/** 打开才读取配置；记忆条目不可读时核验原库供引用复用，其他失败不能确认选择。 */
export function PresetPackResourceDetailDrawer({
	target,
	open,
	selected,
	selectedCount,
	onClose,
	onAfterClose,
	onSelect,
}: {
	target: PresetPackResourceTarget;
	open: boolean;
	selected: boolean;
	selectedCount: number;
	onClose: () => void;
	onAfterClose: () => void;
	onSelect: () => void;
}) {
	const { t } = useTranslation("presetPacks");
	const supported = Object.hasOwn(resourceLabels, target.type);
	const label = supported ? t(resourceLabels[target.type]!) : target.type;
	const readable = supported && Boolean(target.resource.id);
	const query = useResourceConfiguration(target, open && readable);
	const ready = readable && !query.loading && !query.error && Boolean(query.data);
	const limit = presetPackResourceSelectionLimit(target.type);
	const full = !selected && limit !== undefined && limit > 1 && selectedCount >= limit;
	return (
		<Drawer
			title={t("detail.drawerTitle", { label })}
			size="large"
			open={open}
			onClose={onClose}
			destroyOnHidden
			afterOpenChange={(visible) => {
				if (!visible) onAfterClose();
			}}
			footer={
				<div className="flex justify-end gap-2">
					<Button onClick={onClose}>{t("detail.cancel")}</Button>
					<Button type="primary" disabled={!ready || selected || full} onClick={onSelect}>
						{selected ? t("detail.selected") : t("detail.confirmSelect")}
					</Button>
				</div>
			}
		>
			<div className="space-y-4">
				<ResourceSelectionNotice
					limit={limit}
					selected={selected}
					selectedCount={selectedCount}
					full={full}
					label={label}
				/>
				<ResourceBindings resource={target.resource} />
				{!readable ? (
					<Alert
						type="warning"
						showIcon
						title={supported ? t("detail.cannotSelect") : t("detail.errUnsupportedType")}
					/>
				) : query.error ? (
					<Result
						status="error"
						title={t("detail.configLoadFailed")}
						subTitle={query.error}
						extra={<Button onClick={() => void query.refresh()}>{t("detail.retry")}</Button>}
					/>
				) : query.data ? (
					<ConfigurationView configuration={query.data} onRetry={() => void query.refresh()} />
				) : (
					<Spin aria-label={t("detail.readingConfig")} />
				)}
			</div>
		</Drawer>
	);
}
