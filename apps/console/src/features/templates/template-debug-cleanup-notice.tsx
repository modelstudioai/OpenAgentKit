import { ErrorState } from "@openagentpack/kit-chat-ui";
import { Button } from "antd";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";
import { templateDebugCleanupQueue } from "./template-debug-cleanup.ts";
import styles from "./template-pages.module.less";

/** 挂在 App 中，离开预览或详情后仍能看到未完成的调试会话清理并手动重试。 */
export function TemplateDebugCleanupNotice() {
	const { t } = useTranslation("templates");
	const tasks = useSyncExternalStore(
		templateDebugCleanupQueue.subscribe,
		templateDebugCleanupQueue.getSnapshot,
		templateDebugCleanupQueue.getSnapshot,
	);
	const retry = useAdminMutation(() => templateDebugCleanupQueue.retryFailed());
	const failures = tasks.filter((task) => task.error !== null);
	const pending = retry.pending || tasks.some((task) => task.pending);
	const retryPending = retry.pending || failures.some((task) => task.pending);
	if (!tasks.length) return null;
	const details = failures
		.map((task) => t("debugCleanup.failureLine", { sessionId: task.sessionId, error: task.error }))
		.join("\n");
	return (
		<section aria-label={t("debugCleanup.aria")} className={styles.noticeRoot}>
			{failures.length ? (
				<>
					<ErrorState message={t("debugCleanup.failed", { details })} />
					<Button disabled={retryPending} onClick={() => void retry.run().catch(() => {})}>
						{t("debugCleanup.retry")}
					</Button>
				</>
			) : null}
			{pending ? (
				<p role="status" className={styles.cleaningText}>
					{t("debugCleanup.pending")}
				</p>
			) : null}
		</section>
	);
}
