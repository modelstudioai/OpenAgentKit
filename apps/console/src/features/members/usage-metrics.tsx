import { InfoCircleOutlined } from "@ant-design/icons";
import type { MemberSessionUsage, MemberUsageSummary } from "@openagentpack/kit-sdk/protocol";
import { Tooltip } from "antd";
import { StatCard, StatCell } from "../../lib/stat-card.tsx";

import styles from "./members.module.less";

export const collectionLabels: Record<MemberSessionUsage["collection_status"], string> = {
	pending: "待获取",
	complete: "已采集",
	partial: "部分缺失",
	failed: "采集失败",
	not_found: "远端会话不存在",
};

export const usageMetrics = [
	["input_tokens", "输入 Token"],
	["output_tokens", "输出 Token"],
	["cache_read_input_tokens", "缓存读取 Token"],
	["cache_creation_input_tokens", "缓存写入 Token"],
	["active_seconds", "执行时长（秒）"],
	["duration_seconds", "会话时长（秒）"],
] as const;

export function usageValue(
	summary: Pick<MemberUsageSummary, "metrics" | "session_count"> | undefined,
	key: (typeof usageMetrics)[number][0],
) {
	const metric = summary?.metrics[key];
	if (!metric || metric.value === null) return "待获取";
	const value = metric.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
	return metric.covered_sessions < (summary?.session_count ?? 0) ? `${value}（部分缺失）` : value;
}

const metricNotes: Record<(typeof usageMetrics)[number][0], string> = {
	input_tokens: "输入侧 Token 合计。缓存 Token 与输入 Token 的包含关系由 Provider 决定，此处不相加。",
	output_tokens: "输出侧 Token 合计。",
	cache_read_input_tokens: "缓存命中读取的 Token。",
	cache_creation_input_tokens: "创建缓存写入的 Token。",
	active_seconds: "模型执行时间合计，只统计执行时间。",
	duration_seconds: "会话存活时间合计。",
};

/** 成员/模版共用的用量汇总卡：蓝/灰交替浅色卡 + 覆盖数 hint，部分覆盖时警示提示。 */
export function UsageMetrics({ summary }: { summary: Pick<MemberUsageSummary, "metrics" | "session_count"> }) {
	return (
		<dl className={styles.metricsGrid}>
			{usageMetrics.map(([key, label], index) => {
				const metric = summary.metrics[key];
				const coverage = `覆盖 ${metric.covered_sessions} / ${summary.session_count} 个会话`;
				return (
					<div key={key} data-testid={`usage-${key}`}>
						<StatCard tone={index % 2 === 0 ? "tint" : "subtle"}>
							<StatCell
								label={
									<>
										{label}
										<Tooltip title={metricNotes[key]}>
											{/* 装饰性提示图标：悬停出口径说明，完整口径文本在下方「口径说明」弹层（含读屏路径）。 */}
											<span aria-hidden="true" className={styles.metricInfo}>
												<InfoCircleOutlined />
											</span>
										</Tooltip>
									</>
								}
								value={metric.value}
								hint={
									metric.covered_sessions < summary.session_count ? (
										<span className={styles.partialHint}>{coverage} · 部分缺失</span>
									) : (
										coverage
									)
								}
							/>
						</StatCard>
					</div>
				);
			})}
		</dl>
	);
}
