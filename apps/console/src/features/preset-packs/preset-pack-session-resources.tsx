import type { PresetPackAgentResources, PresetPackCreateInput, PresetPackPreview } from "@openagentkit/sdk/protocol";
import type { TableColumnsType } from "antd";
import { Alert, Button, Empty, Result, Space, Spin, Table, Tag } from "antd";
import type { TFunction } from "i18next";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminApi, getAdminClient } from "../../lib/api.ts";
import type { RemoteAgent } from "../catalog/use-remote-agents.ts";
import {
	PresetPackResourceDetailDrawer,
	type PresetPackResourceTarget,
} from "./preset-pack-resource-detail-drawer.tsx";
import {
	groupPresetPackResources,
	type PresetPackResourceGroup,
	type PresetPackResourceRow,
} from "./preset-pack-resource-groups.ts";
import { presetPackResourceSelectionLimit, selectPresetPackResource } from "./preset-pack-resource-selection.ts";

const resourceTypes: Record<
	string,
	"types.environment" | "types.file" | "types.memoryStore" | "types.vault" | "types.github"
> = {
	environment: "types.environment",
	file: "types.file",
	memory_store: "types.memoryStore",
	vault: "types.vault",
	github_repository: "types.github",
};

function resourceColumns(t: TFunction<"presetPacks">): TableColumnsType<PresetPackResourceRow> {
	return [
		{ title: t("resources.id"), dataIndex: "id", render: (id?: string) => id ?? "—" },
		{ title: t("resources.mountPaths"), render: (_, resource) => resource.mountPaths.join(t("joinComma")) || "—" },
		{
			title: t("resources.access"),
			render: (_, resource) =>
				resource.accesses
					.map((access) => (access === "read_only" ? t("detail.readOnly") : t("detail.readWrite")))
					.join(t("joinComma")) || "—",
		},
		{
			title: t("resources.source"),
			render: (_, resource) =>
				resource.sources
					.map((source) => (source === "runtime" ? t("detail.sourceRuntime") : t("detail.sourceSession")))
					.join(t("joinComma")),
		},
	];
}

function ResourceGroupTable({
	group,
	selectedKeys,
	loading,
	disabled,
	complete,
	onView,
	onRemove,
}: {
	group: PresetPackResourceGroup;
	selectedKeys: string[];
	loading: boolean;
	disabled: boolean;
	complete: boolean;
	onView: (resource: PresetPackResourceRow) => void;
	onRemove: (key: string) => void;
}) {
	const { t } = useTranslation("presetPacks");
	const label = Object.hasOwn(resourceTypes, group.type) ? t(resourceTypes[group.type]!) : group.type;
	const limit = presetPackResourceSelectionLimit(group.type);
	const selectionRule =
		limit === 1
			? t("resources.ruleSingle")
			: limit
				? t("resources.ruleMulti", { limit })
				: t("resources.ruleUnsupported");
	const details =
		group.type === "github_repository"
			? [
					...resourceColumns(t),
					{
						title: t("resources.repoUrl"),
						render: (_: unknown, resource: PresetPackResourceRow) =>
							resource.repositoryUrls.join(t("joinComma")) || "—",
					},
				]
			: resourceColumns(t);
	const columns: TableColumnsType<PresetPackResourceRow> = [
		...details,
		{
			title: t("resources.selectState"),
			render: (_, resource) =>
				selectedKeys.includes(resource.key) ? (
					<Space>
						<Tag color="success">{t("resources.selectedTag")}</Tag>
						<Button
							type="link"
							size="small"
							disabled={disabled}
							aria-label={t("resources.deselectAria", { label, id: resource.id })}
							onClick={(event) => {
								event.stopPropagation();
								onRemove(resource.key);
							}}
						>
							{t("resources.deselect")}
						</Button>
					</Space>
				) : (
					<Tag>{t("resources.notSelected")}</Tag>
				),
		},
	];
	return (
		<section aria-label={t("resources.groupAria", { label })} className="space-y-4">
			<h3 className="text-sm font-medium">{t("resources.groupTitle", { label, rule: selectionRule })}</h3>
			<Table<PresetPackResourceRow>
				rowKey="key"
				columns={columns}
				dataSource={group.rows}
				loading={loading}
				rowClassName={
					disabled
						? "cursor-not-allowed"
						: "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
				}
				onRow={(resource) => ({
					tabIndex: disabled ? -1 : 0,
					"aria-label": t("resources.rowAria", {
						label,
						id: resource.id || t("resources.unnamedResource"),
					}),
					"aria-haspopup": "dialog",
					"aria-disabled": disabled,
					onClick: () => {
						if (!disabled) onView(resource);
					},
					onKeyDown: (event) => {
						if (disabled || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " "))
							return;
						event.preventDefault();
						onView(resource);
					},
				})}
				scroll={{ x: "max-content" }}
				locale={{
					emptyText: (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={complete ? t("resources.emptyLinked") : t("resources.emptyRead")}
						/>
					),
				}}
				pagination={{
					pageSize: 10,
					showSizeChanger: false,
					showTotal: (total) => t("resources.totalResources", { total }),
				}}
			/>
		</section>
	);
}

/** 选择变化创建独立查询，迟到响应不覆盖新智能体。 */
export function usePresetPackResources(
	agentId: string,
	{ enabled = true, initialData }: { enabled?: boolean; initialData?: PresetPackAgentResources } = {},
) {
	const initial = initialData?.agent_id === agentId ? initialData : undefined;
	const query = useAdminQuery(
		`preset-pack-resources:${agentId}`,
		(signal) => adminApi.presetPacks.agentResources(agentId, signal),
		{ enabled: enabled && !initial },
	);
	return { ...query, data: query.data ?? initial };
}

interface ResourceSelectionProps {
	agent: RemoteAgent;
	onPendingChange: (pending: boolean) => void;
	onImport: (preset: PresetPackPreview) => void;
	actionLabel?: string;
	requireSelection?: boolean;
	actionContainer?: HTMLElement | null;
	feedbackContainer?: HTMLElement | null;
}

function ResourceSelectionSlot({ container, children }: { container?: HTMLElement | null; children: ReactNode }) {
	if (container === undefined) return children;
	return container ? createPortal(children, container) : null;
}

function ResourceEmptyState({ loading, complete }: { loading: boolean; complete?: boolean }) {
	const { t } = useTranslation("presetPacks");
	if (loading) return <Spin aria-label={t("resources.readingRuntime")} />;
	return (
		<Empty
			image={Empty.PRESENTED_IMAGE_SIMPLE}
			description={complete ? t("resources.emptyRuntime") : t("resources.emptyRead")}
		/>
	);
}

export function PresetPackSessionResources(props: ResourceSelectionProps) {
	const query = usePresetPackResources(props.agent.agent_id);
	return <PresetPackResourceSelection {...props} query={query} />;
}

/** 预设包导入与基础配置关联资源共用分组、多选和只读核验，不重复读取发现结果。 */
export function PresetPackResourceSelection({
	agent,
	onPendingChange,
	onImport,
	query,
	actionLabel,
	requireSelection = false,
	actionContainer,
	feedbackContainer,
}: ResourceSelectionProps & {
	query: ReturnType<typeof usePresetPackResources>;
}) {
	const { t } = useTranslation("presetPacks");
	const agentId = agent.agent_id;
	const client = useMemo(getAdminClient, []);
	const identity = useAdminQuery("preset-packs:identity", (signal) => client.identity(signal));
	const [selectedResourceKeys, setSelectedResourceKeys] = useState(() => new Map<string, string[]>());
	const [viewing, setViewing] = useState<(PresetPackResourceTarget & { revision: number }) | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const detailSequence = useRef(0);
	const [attempt, setAttempt] = useState(0);
	const request = useRef<AbortController | null>(null);
	const groups = groupPresetPackResources(query.data?.sessions ?? []);
	const selectedCount = groups.reduce((total, group) => {
		const selected = new Set(selectedResourceKeys.get(group.type));
		return total + group.rows.filter((resource) => selected.has(resource.key)).length;
	}, 0);
	const importing = useAdminMutation(async () => {
		const resources: PresetPackCreateInput["resources"] = [];
		for (const group of groups) {
			for (const row of group.rows) {
				if (!selectedResourceKeys.get(group.type)?.includes(row.key)) continue;
				if (!row.id) throw new Error(t("resources.errNoIdForImport"));
				resources.push({ type: group.type, resource_id: row.id });
			}
		}
		const controller = new AbortController();
		request.current = controller;
		const prepared = await adminApi.presetPacks.preview(
			{ remote_agent_id: agentId, agent_version: agent.version, resources },
			controller.signal,
		);
		if (!controller.signal.aborted) onImport(prepared);
	});
	useEffect(() => () => request.current?.abort(), []);
	useEffect(() => {
		onPendingChange(importing.pending || detailOpen);
		return () => {
			onPendingChange(false);
		};
	}, [importing.pending, detailOpen, onPendingChange]);
	const selectResource = (type: string, key: string, selected: boolean) => {
		setSelectedResourceKeys((current) => selectPresetPackResource(current, type, key, selected));
	};
	const loading = query.loading || !query.data || importing.pending;
	const loadError = query.error ?? identity.error;
	if (loadError)
		return (
			<Result
				status="error"
				title={t("resources.loadFailed")}
				subTitle={loadError}
				extra={
					<Button onClick={() => void Promise.allSettled([query.refresh(), identity.refresh()])}>
						{t("resources.retry")}
					</Button>
				}
			/>
		);
	return (
		<section aria-label={t("resources.runtimeAria")} className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h2 className="text-base font-medium">{t("resources.runtimeTitle")}</h2>
				<span role="status" aria-label={t("resources.selectedAria")} className="text-sm">
					{t("resources.selectedCount", { count: selectedCount })}
				</span>
			</div>
			{query.data && !query.data.complete ? (
				<Alert
					type="warning"
					showIcon
					title={t("resources.incompleteTitle")}
					description={t("resources.incompleteDesc")}
					action={
						<Button disabled={importing.pending} onClick={() => void query.refresh()}>
							{t("resources.reread")}
						</Button>
					}
				/>
			) : null}
			{!groups.length ? <ResourceEmptyState loading={loading} complete={query.data?.complete} /> : null}
			{groups.map((group) => (
				<ResourceGroupTable
					key={group.type}
					group={group}
					selectedKeys={selectedResourceKeys.get(group.type) ?? []}
					loading={loading}
					disabled={loading || detailOpen}
					complete={Boolean(query.data?.complete)}
					onView={(resource) => {
						setViewing({ type: group.type, resource, revision: ++detailSequence.current });
						setDetailOpen(true);
					}}
					onRemove={(key) => selectResource(group.type, key, false)}
				/>
			))}
			{viewing ? (
				<PresetPackResourceDetailDrawer
					key={`${viewing.type}:${viewing.resource.key}:${viewing.revision}`}
					target={viewing}
					open={detailOpen}
					selected={selectedResourceKeys.get(viewing.type)?.includes(viewing.resource.key) ?? false}
					selectedCount={selectedResourceKeys.get(viewing.type)?.length ?? 0}
					onClose={() => setDetailOpen(false)}
					onAfterClose={() => setViewing((current) => (current?.revision === viewing.revision ? null : current))}
					onSelect={() => {
						selectResource(viewing.type, viewing.resource.key, true);
						setDetailOpen(false);
					}}
				/>
			) : null}
			<ResourceSelectionSlot container={feedbackContainer}>
				{importing.error ? (
					<Alert
						key={attempt}
						type="error"
						showIcon
						closable
						title={t("resources.importFailed")}
						description={importing.error}
					/>
				) : null}
			</ResourceSelectionSlot>
			<ResourceSelectionSlot container={actionContainer}>
				<div className="flex justify-end">
					<Button
						type="primary"
						loading={importing.pending}
						disabled={
							loading || detailOpen || identity.data?.role !== "admin" || (requireSelection && selectedCount === 0)
						}
						onClick={() => {
							setAttempt((value) => value + 1);
							void importing.run().catch(() => undefined);
						}}
					>
						{actionLabel ?? t("resources.importLabel")}
					</Button>
				</div>
			</ResourceSelectionSlot>
		</section>
	);
}
