import type { RemoteMemoryStore, RemoteVault, TemplateView } from "@openagentpack/kit-sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button } from "antd";
import i18n from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminApi, getAdminClient } from "../../lib/api.ts";
import { AGENT_CONFIGURATION_FIELDS, agentConfigurationText } from "./template-configuration-fields.ts";
import { type AgentDetail, loadTemplateAgentDetail } from "./use-template-agent-detail.ts";

type ReadResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };
const agentKey = (row: TemplateView) =>
	JSON.stringify([row.remote_agent_id, row.agent_version ?? row.remote_agent_version]);

async function readResult<T>(read: () => Promise<T>, signal: AbortSignal): Promise<ReadResult<T>> {
	try {
		return { data: await read() };
	} catch (error) {
		if (signal.aborted) throw error;
		return {
			error: error instanceof Error ? error.message : i18n.getFixedT(null, "templates")("listConfig.loadFailed"),
		};
	}
}

function useListConfiguration(rows: TemplateView[]) {
	const client = useMemo(getAdminClient, []);
	const key = JSON.stringify(rows.map((row) => [row.template_id, row.version, agentKey(row)]));
	return useAdminQuery(
		`templates:list:configuration:${key}`,
		async (signal) => {
			const pending = [...new Map(rows.map((row) => [agentKey(row), row])).entries()];
			const agents = new Map<string, ReadResult<AgentDetail>>();
			const agentReads = Promise.all(
				Array.from({ length: Math.min(4, pending.length) }, async () => {
					let entry = pending.shift();
					while (entry) {
						const [key, row] = entry;
						agents.set(
							key,
							await readResult(
								() =>
									loadTemplateAgentDetail(
										client,
										{ agent_id: row.remote_agent_id, name: row.remote_agent_name },
										row.agent_version ?? row.remote_agent_version,
										signal,
									),
								signal,
							),
						);
						entry = pending.shift();
					}
				}),
			);
			const [memories, vaults] = await Promise.all([
				readResult<RemoteMemoryStore[]>(
					() =>
						rows.some((row) => row.memory_stores.length) ? adminApi.remoteMemoryStores(signal) : Promise.resolve([]),
					signal,
				),
				readResult<RemoteVault[]>(
					() => (rows.some((row) => row.vault_ids.length) ? adminApi.remoteVaults(signal) : Promise.resolve([])),
					signal,
				),
				agentReads,
			]);
			return { agents, memories, vaults };
		},
		{ enabled: rows.length > 0 },
	);
}

function ConfigurationCell({
	value,
	loading,
	error,
	onRetry,
}: {
	value: string;
	loading?: boolean;
	error?: string | null;
	onRetry: () => void;
}) {
	if (loading) return null;
	if (error)
		return (
			<Button type="link" size="small" title={error} onClick={onRetry}>
				{i18n.getFixedT(null, "templates")("listConfig.retry")}
			</Button>
		);
	return <span title={value}>{value}</span>;
}

function resourceName(name: string | undefined, id: string) {
	return name && name !== id ? i18n.getFixedT(null, "templates")("listConfig.resourceName", { name, id }) : id;
}

/** 仅补齐当前页的展示配置；不读取记忆正文、密钥详情或改变保存的版本绑定。 */
export function useTemplateConfigurationColumns(rows: TemplateView[]) {
	const { t } = useTranslation("templates");
	const query = useListConfiguration(rows);
	const memoryNames = new Map(query.data?.memories.data?.map((row) => [row.memory_store_id, row.name]));
	const vaultNames = new Map(query.data?.vaults.data?.map((row) => [row.vault_id, row.name]));
	const loading = query.loading || (!query.data && !query.error);
	const retry = () => void query.refresh();
	const columns: TableColumnsType<TemplateView> = [
		...AGENT_CONFIGURATION_FIELDS.map(({ key, label }) => ({
			key,
			title: t(label),
			width: key === "instructions" ? 320 : key === "description" ? 240 : 180,
			ellipsis: true,
			render: (_: unknown, row: TemplateView) => {
				const detail = query.data?.agents.get(agentKey(row));
				return (
					<ConfigurationCell
						value={detail?.data ? agentConfigurationText(detail.data, key) : ""}
						loading={loading}
						error={query.error || detail?.error}
						onRetry={retry}
					/>
				);
			},
		})),
		{
			key: "environment",
			title: t("fields.environment"),
			width: 220,
			ellipsis: true,
			render: (_, row) => (
				<ConfigurationCell
					value={
						row.remote_environment_id
							? resourceName(row.remote_environment_name, row.remote_environment_id)
							: t("listConfig.defaultEnvironment")
					}
					onRetry={retry}
				/>
			),
		},
		{
			key: "files",
			title: t("fields.files"),
			width: 260,
			ellipsis: true,
			render: (_, row) => (
				<ConfigurationCell
					value={
						row.files
							.map(
								(file) =>
									`${resourceName(file.filename, file.file_id)}\n${t("listConfig.mountPath", { path: file.mount_path || "—" })}`,
							)
							.join("\n") || t("common.notSelected")
					}
					onRetry={retry}
				/>
			),
		},
		{
			key: "memories",
			title: t("fields.memories"),
			width: 260,
			ellipsis: true,
			render: (_, row) => (
				<ConfigurationCell
					value={
						row.memory_stores
							.map(
								(memory) =>
									`${resourceName(memoryNames.get(memory.memory_store_id), memory.memory_store_id)}\n${t("listConfig.access", { access: memory.access === "read_only" ? t("listConfig.readOnly") : t("listConfig.readWrite") })}\n${t("listConfig.instructions", { text: memory.instructions?.trim() || "—" })}`,
							)
							.join("\n") || t("common.notSelected")
					}
					loading={row.memory_stores.length > 0 && loading}
					error={row.memory_stores.length ? query.error || query.data?.memories.error : undefined}
					onRetry={retry}
				/>
			),
		},
		{
			key: "vaults",
			title: t("fields.vaults"),
			width: 220,
			ellipsis: true,
			render: (_, row) => (
				<ConfigurationCell
					value={row.vault_ids.map((id) => resourceName(vaultNames.get(id), id)).join("\n") || t("common.notSelected")}
					loading={row.vault_ids.length > 0 && loading}
					error={row.vault_ids.length ? query.error || query.data?.vaults.error : undefined}
					onRetry={retry}
				/>
			),
		},
	];
	return { columns, loading: rows.length > 0 && loading };
}
