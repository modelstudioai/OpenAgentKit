import type { MemberUsageSummary } from "@openagentkit/sdk/protocol";
import { useTranslation } from "react-i18next";

import styles from "./members.module.less";

export function UsageCollectionStatus({ summary }: { summary?: MemberUsageSummary }) {
	const { t } = useTranslation(["members", "common"]);
	const labels = {
		idle: summary?.session_count ? t("status.idleWithSessions") : t("status.idleNoSessions"),
		refreshing: t("status.refreshing"),
		partial: t("status.partial"),
		failed: t("status.failed"),
	};
	return (
		<div className={styles.statusRoot}>
			<span role="status" aria-label={t("status.aria")}>
				{summary ? labels[summary.refresh_status] : t("common:collection.pending")}
			</span>{" "}
			<span className={styles.statusTime}>
				{summary?.refreshed_at ? (
					<>
						{t("status.lastSuccess")}
						<time dateTime={summary.refreshed_at}>
							{new Date(summary.refreshed_at).toLocaleString("zh-CN", { hour12: false })}
						</time>
					</>
				) : (
					t("status.never")
				)}
			</span>
		</div>
	);
}
