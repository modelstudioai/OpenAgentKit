import type { EvalRunDetail, EvalRunSummary, EvalWorkspaceView } from "@openagentkit/sdk/protocol";
import type { TableColumnsType } from "antd";
import { Alert, Button, Select, Table } from "antd";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./app.module.less";
import { useConsoleRoute } from "./features/navigation/console-router.tsx";
import { adminApi } from "./lib/api.ts";

function runColumns(t: TFunction<"eval">, onOpen: (runId: string) => void) {
	return [
		{
			title: t("columns.run"),
			dataIndex: "run_id",
			render: (_, row: EvalRunSummary) => <span className={styles.monoMeta}>{row.run_id}</span>,
		},
		{
			title: t("columns.skill"),
			render: (_, row: EvalRunSummary) => `${row.skill.name} v${row.skill.version}`,
		},
		{
			title: t("columns.passRate"),
			align: "right" as const,
			render: (_, row: EvalRunSummary) => <span className={styles.passRate}>{row.pass_rate.toFixed(2)}</span>,
		},
		{
			title: t("columns.baselineDelta"),
			align: "right" as const,
			render: (_, row: EvalRunSummary) => (
				<span className={styles.tabularNum}>
					{row.delta_pass_rate == null ? "-" : `${row.delta_pass_rate >= 0 ? "+" : ""}${row.delta_pass_rate}`}
				</span>
			),
		},
		{
			title: t("columns.infraExcluded"),
			render: (_, row: EvalRunSummary) => row.infra_excluded || "-",
		},
		{
			title: t("columns.cases"),
			align: "right" as const,
			render: (_, row: EvalRunSummary) => <span className={styles.tabularNum}>{row.case_count}</span>,
		},
		{
			title: t("columns.createdAt"),
			render: (_, row: EvalRunSummary) => (
				<span className={styles.metaText}>{row.created_at.slice(0, 16).replace("T", " ")}</span>
			),
		},
		{
			title: t("columns.actions"),
			render: (_, row: EvalRunSummary) => (
				<Button type="link" size="small" data-testid={`eval-open-${row.run_id}`} onClick={() => onOpen(row.run_id)}>
					{t("viewReport")}
				</Button>
			),
		},
	] satisfies TableColumnsType<EvalRunSummary>;
}

/**
 * 评测浏览页（只读）：workspace → run 列表 → run 详情（report.html 用 srcdoc 内嵌，
 * 令牌只走 Authorization header，不进 URL）。触发执行留给 CLI/CI（跑几分钟且碰本地 FS）。
 */
export function EvalPage() {
	const { t } = useTranslation("eval");
	const [workspaces, setWorkspaces] = useState<EvalWorkspaceView[]>([]);
	const { route, navigate } = useConsoleRoute();
	const workspace = route.workspace ?? workspaces[0]?.path ?? "";
	const runId = route.run;
	const [runs, setRuns] = useState<EvalRunSummary[]>([]);
	const [loadingRuns, setLoadingRuns] = useState(false);
	const [detail, setDetail] = useState<EvalRunDetail | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		adminApi.eval
			.workspaces()
			.then((list) => {
				setWorkspaces(list);
			})
			.catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)));
	}, []);

	useEffect(() => {
		let active = true;
		setRuns([]);
		if (!workspace) return;
		setLoadingRuns(true);
		setError(null);
		adminApi.eval
			.runs(workspace)
			.then((value) => {
				if (active) setRuns(value);
			})
			.catch((e: unknown) => {
				if (active) setError(String(e instanceof Error ? e.message : e));
			})
			.finally(() => {
				if (active) setLoadingRuns(false);
			});
		return () => {
			active = false;
		};
	}, [workspace]);

	useEffect(() => {
		let active = true;
		setDetail(null);
		if (!workspace || !runId) return;
		setError(null);
		adminApi.eval
			.run(workspace, runId)
			.then((value) => {
				if (active) setDetail(value);
			})
			.catch((e: unknown) => {
				if (active) setError(e instanceof Error ? e.message : String(e));
			});
		return () => {
			active = false;
		};
	}, [workspace, runId]);

	const workspaceOptions = workspaces.map((w) => ({
		value: w.path,
		label: `${w.name}${w.skill_name ? ` · ${w.skill_name}` : ""} · ${w.runs} runs`,
	}));

	return (
		<div className={styles.evalRoot}>
			<section className={styles.evalPanel}>
				<div className={styles.evalControls}>
					<strong>{t("workspace")}</strong>
					<Select
						aria-label={t("workspaceAria")}
						className={styles.workspaceSelect}
						placeholder={workspaces.length === 0 ? t("workspaceUnconfigured") : t("workspacePlaceholder")}
						value={workspace || undefined}
						options={workspaceOptions}
						onChange={(value) => navigate({ page: "eval", workspace: value })}
					/>
					<span className={styles.metaText}>
						{t("readonlyPrefix")}
						<code>pnpm eval run</code>
						{t("readonlySuffix")}
					</span>
				</div>
				{error ? <Alert type="error" showIcon message={error} /> : null}
			</section>

			<section className={styles.runsSection}>
				<h3 className={styles.runsTitle}>{t("runsTitle")}</h3>
				<Table
					rowKey="run_id"
					size="middle"
					loading={loadingRuns}
					columns={runColumns(t, (id) => navigate({ page: "eval", workspace, run: id }))}
					dataSource={runs}
					pagination={false}
					scroll={{ x: "max-content" }}
					locale={{ emptyText: t("emptyRuns") }}
				/>
			</section>

			{detail ? (
				<section className={styles.evalPanel}>
					<div className={styles.evalControls}>
						<strong>{t("reportTitle", { id: detail.summary.run_id })}</strong>
						<span className={styles.metaText}>
							pass_rate {detail.summary.pass_rate.toFixed(2)}
							{detail.summary.baseline_pass_rate == null
								? ""
								: t("baseline", {
										baseline: detail.summary.baseline_pass_rate.toFixed(2),
										delta: detail.summary.delta_pass_rate ?? 0,
									})}
						</span>
					</div>
					<iframe
						title={t("reportFrameTitle")}
						data-testid="eval-report-frame"
						srcDoc={detail.report_html}
						className={styles.reportFrame}
					/>
				</section>
			) : null}
		</div>
	);
}
