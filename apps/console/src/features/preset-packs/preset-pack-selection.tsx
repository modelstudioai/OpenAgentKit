import type { PresetPackPreview } from "@openagentpack/kit-sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, Empty, Input, Result, Table } from "antd";
import type { TFunction } from "i18next";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { type RemoteAgent, useRemoteAgents } from "../catalog/use-remote-agents.ts";
import { PresetPackSessionResources } from "./preset-pack-session-resources.tsx";

function columns(t: TFunction<"presetPacks">): TableColumnsType<RemoteAgent> {
	return [
		{
			title: t("cols.name"),
			dataIndex: "name",
			ellipsis: true,
			render: (name: string, agent) => name || agent.agent_id,
		},
		{ title: t("cols.id"), dataIndex: "agent_id", ellipsis: true },
		{
			title: t("cols.version"),
			dataIndex: "version",
			render: (version: number | undefined) => (version === undefined ? "—" : `v${version}`),
		},
	];
}

/** 使用完整远端列表分页展示，不混入本地模版或未发布草稿。 */
export function PresetPackSelection({
	onImport,
	onPendingChange,
}: {
	onImport: (preset: PresetPackPreview) => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const { t } = useTranslation("presetPacks");
	const agents = useRemoteAgents();
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [importing, setImporting] = useState(false);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const updatePending = useCallback(
		(pending: boolean) => {
			setImporting(pending);
			onPendingChange(pending);
		},
		[onPendingChange],
	);
	const selectedAgent = agents.data?.find((agent) => agent.agent_id === selectedAgentId);
	const rows = (agents.data ?? []).filter((agent) =>
		`${agent.name}\n${agent.agent_id}`.toLowerCase().includes(search.toLowerCase()),
	);
	return (
		<section aria-label={t("selectionAria")} className="space-y-4">
			<section aria-label={t("agentsAria")} className="space-y-4">
				<h2 className="text-base font-medium">{t("agentsTitle")}</h2>
				<Input.Search
					allowClear
					aria-label={t("searchAria")}
					placeholder={t("searchPlaceholder")}
					disabled={importing}
					onSearch={(value) => {
						setSearch(value.trim());
						setPage(1);
					}}
				/>
				{agents.error ? (
					<Result
						status="error"
						title={t("loadFailed")}
						subTitle={agents.error}
						extra={<Button onClick={() => void agents.refresh()}>{t("retry")}</Button>}
					/>
				) : (
					<Table<RemoteAgent>
						rowKey="agent_id"
						rowSelection={{
							type: "radio",
							selectedRowKeys: selectedAgentId ? [selectedAgentId] : [],
							onChange: (keys) => setSelectedAgentId(keys[0] === undefined ? null : String(keys[0])),
							getCheckboxProps: (agent) => ({
								"aria-label": t("selectAria", { name: agent.name || agent.agent_id, id: agent.agent_id }),
								disabled: importing,
							}),
						}}
						columns={columns(t)}
						dataSource={rows}
						loading={agents.loading || !agents.data}
						scroll={{ x: "max-content" }}
						locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("emptyAgents")} /> }}
						pagination={{
							current: page,
							onChange: setPage,
							pageSize: 10,
							showSizeChanger: false,
							showTotal: (total) => t("totalAgents", { total }),
						}}
					/>
				)}
			</section>
			{selectedAgent ? (
				<PresetPackSessionResources
					key={selectedAgent.agent_id}
					agent={selectedAgent}
					onPendingChange={updatePending}
					onImport={onImport}
				/>
			) : null}
		</section>
	);
}
