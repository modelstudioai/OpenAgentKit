import type { AuditLogView } from "@openagentpack/kit-sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, Empty, Result, Table } from "antd";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminApi } from "../../lib/api.ts";

const actionLabels: Record<
	string,
	| "actions.create"
	| "actions.update"
	| "actions.delete"
	| "actions.listing"
	| "actions.unlist"
	| "actions.brandingUpdate"
> = {
	"templates.create": "actions.create",
	"templates.update": "actions.update",
	"templates.delete": "actions.delete",
	"templates.listing": "actions.listing",
	"catalog.create": "actions.create",
	"catalog.update": "actions.update",
	"catalog.delete": "actions.delete",
	"catalog.list": "actions.listing",
	"catalog.unlist": "actions.unlist",
	"branding.update": "actions.brandingUpdate",
};

function detailOf(row: AuditLogView): { name?: string; version?: number } {
	try {
		const detail: unknown = JSON.parse(row.detail ?? "null");
		if (!detail || typeof detail !== "object" || Array.isArray(detail)) return {};
		return {
			name: "name" in detail && typeof detail.name === "string" ? detail.name : undefined,
			version: "version" in detail && typeof detail.version === "number" ? detail.version : undefined,
		};
	} catch {
		return {};
	}
}

function columns(t: TFunction<"operations">): TableColumnsType<AuditLogView> {
	return [
		{
			title: t("columns.at"),
			dataIndex: "at",
			width: 190,
			render: (at: string) => <time dateTime={at}>{new Date(at).toLocaleString("zh-CN", { hour12: false })}</time>,
		},
		{
			title: t("columns.action"),
			dataIndex: "action",
			width: 160,
			render: (action: string) => (action in actionLabels ? t(actionLabels[action]!) : action),
		},
		{
			title: t("columns.target"),
			key: "target",
			width: 280,
			render: (_, row) => {
				const detail = detailOf(row);
				return (
					<div className="break-words">
						{detail.name ? <p>{detail.name}</p> : null}
						<p className="text-xs text-neutral-500">{row.target ?? t("globalTarget")}</p>
						{detail.version !== undefined ? (
							<p className="text-xs text-neutral-500">{t("version", { version: detail.version })}</p>
						) : null}
					</div>
				);
			},
		},
	];
}

export function OperationsPage() {
	const { t } = useTranslation("operations");
	const [page, setPage] = useState(1);
	const pageSize = 20;
	const logs = useAdminQuery(`audit:${page}`, (signal) =>
		adminApi.audit.list({ limit: pageSize, offset: (page - 1) * pageSize }, signal),
	);
	return (
		<section aria-label={t("title")} className="space-y-4">
			<p className="text-sm text-neutral-500">{t("note")}</p>
			{logs.error ? (
				<Result
					status="error"
					title={t("loadFailed")}
					subTitle={logs.error}
					extra={
						<Button aria-label={t("retry")} onClick={() => void logs.refresh()}>
							{t("retry")}
						</Button>
					}
				/>
			) : (
				<Table<AuditLogView>
					rowKey="id"
					columns={columns(t)}
					dataSource={logs.data?.data ?? []}
					loading={logs.loading || !logs.data}
					scroll={{ x: 630 }}
					locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("empty")} /> }}
					pagination={{
						current: page,
						pageSize,
						total: logs.data?.total ?? 0,
						showSizeChanger: false,
						hideOnSinglePage: true,
						showTotal: (total) => t("total", { total }),
						onChange: setPage,
					}}
				/>
			)}
		</section>
	);
}
