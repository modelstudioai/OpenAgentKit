import type { PublicationReport } from "@openagentpack/kit-sdk/protocol";
import { Table } from "antd";
import { useTranslation } from "react-i18next";

const STATUS_KEYS = {
	succeeded: "publish.report.statuses.succeeded",
	failed: "publish.report.statuses.failed",
	skipped: "publish.report.statuses.skipped",
	unknown: "publish.report.statuses.unknown",
} as const;
const TYPE_KEYS = {
	agent: "publish.report.types.agent",
	environment: "publish.report.types.environment",
	skill: "publish.report.types.skill",
	file: "publish.report.types.file",
	memory_store: "publish.report.types.memory_store",
	vault: "publish.report.types.vault",
} as const;

/** 展示执行事实；允许的恢复动作由批次接口决定。 */
export function TemplatePublicationReport({ report }: { report: PublicationReport }) {
	const { t } = useTranslation("templates");
	return (
		<section aria-label={t("publish.report.aria")} className="space-y-2 animate-(--kit-animate-in)">
			<p>
				{report.outcome === "succeeded" ? t("publish.report.succeeded") : t("publish.report.incomplete")}
				{t("publish.report.statusSuffix")}
			</p>
			<Table
				size="small"
				pagination={false}
				rowKey={(resource) => `${resource.type}:${resource.id}`}
				dataSource={report.resources}
				scroll={{ x: true }}
				columns={[
					{
						title: t("publish.report.colResource"),
						render: (_, resource) => `${t(TYPE_KEYS[resource.type])} · ${resource.id}`,
					},
					{ title: t("publish.report.colResult"), render: (_, resource) => t(STATUS_KEYS[resource.status]) },
					{
						title: t("publish.report.colRemote"),
						render: (_, resource) =>
							resource.remote_id ? `${resource.remote_id}${resource.version ? ` · v${resource.version}` : ""}` : "—",
					},
					{
						title: t("publish.report.colError"),
						render: (_, resource) =>
							resource.error_details
								? t("publish.report.errorDetail", {
										code: resource.error_details.code,
										phase: resource.error_details.phase,
									})
								: "—",
					},
				]}
			/>
		</section>
	);
}
