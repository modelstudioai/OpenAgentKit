import { Alert, Button, Modal } from "antd";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "./template-pages.module.less";
import { TemplatePublicationReport } from "./template-publication-report.tsx";
import { pendingPublishDescription } from "./template-publish-resources.ts";
import type { TemplatePublish } from "./use-template-publish.ts";

export function TemplatePublishStatus({
	publish,
	onRetry,
	retryDisabled,
}: {
	publish: TemplatePublish;
	onRetry: () => void;
	retryDisabled: boolean;
}) {
	const { t } = useTranslation("templates");
	const section = useRef<HTMLElement>(null);
	useEffect(() => {
		if (publish.phase === "loading" || publish.error) section.current?.scrollIntoView({ block: "nearest" });
	}, [publish.phase, publish.error]);
	if (
		!publish.busy &&
		!publish.error &&
		!publish.resumeAvailable &&
		!publish.operation?.publication &&
		!publish.reportError
	)
		return null;
	return (
		<section ref={section} aria-label={t("publish.status.aria")} className={styles.statusPanel}>
			{publish.resumeAvailable && !publish.busy && !publish.error ? (
				<div className={styles.stack2}>
					<p>{t("publish.status.resumeHint")}</p>
					<Button size="small" onClick={publish.start}>
						{t("publish.status.resume")}
					</Button>
				</div>
			) : null}
			{publish.progress ? <p role="status">{publish.progress}</p> : null}
			{publish.operation && publish.busy ? (
				<p className={styles.progressNote}>
					{t("publish.status.progressLabel", { percent: Math.round(publish.operation.progress * 100) })}
				</p>
			) : null}
			{publish.warnings.length ? (
				<p className={styles.reviewMessage}>
					{t("publish.status.warnings", { warnings: publish.warnings.join("\n") })}
				</p>
			) : null}
			<PublishFailure publish={publish} onRetry={onRetry} retryDisabled={retryDisabled} />
			{publish.operation?.publication ? <TemplatePublicationReport report={publish.operation.publication} /> : null}
			{publish.observationError ? (
				<div className={styles.stack2}>
					<Alert
						type="error"
						showIcon
						message={t("publish.status.observationError", { error: publish.observationError })}
					/>
					<Button size="small" onClick={publish.reconnect}>
						{t("publish.status.reconnect")}
					</Button>
				</div>
			) : null}
			{publish.review ? (
				<Modal
					open
					centered
					title={t("publish.status.confirmTitle")}
					okText={t("publish.status.confirmOk")}
					okButtonProps={{ danger: publish.review.plan.destructive }}
					cancelText={t("cancel")}
					onCancel={publish.cancel}
					onOk={publish.confirm}
				>
					<p className={styles.reviewMessage}>
						{`${publish.review.verifyOnly ? t("publish.status.verifyOnlyBody") : t("publish.status.publishBody")}\n\n${pendingPublishDescription(publish.review.plan, publish.review.resourceNames, publish.review.verifyOnly)}${publish.warnings.length ? `\n\n${t("publish.status.warningsBlock", { warnings: publish.warnings.join("\n") })}` : ""}`}
					</p>
				</Modal>
			) : null}
		</section>
	);
}

function PublishFailure({
	publish,
	onRetry,
	retryDisabled,
}: {
	publish: TemplatePublish;
	onRetry: () => void;
	retryDisabled: boolean;
}) {
	const { t } = useTranslation("templates");
	return (
		<>
			{publish.reportError ? (
				<Alert type="warning" showIcon message={t("publish.status.reportError", { error: publish.reportError })} />
			) : null}
			{publish.error ? (
				<>
					<Alert type="error" showIcon message={publish.error} />
					{!publish.blocked ? (
						<Button
							size="small"
							disabled={publish.busy || (!publish.resumeAvailable && retryDisabled)}
							onClick={publish.resumeAvailable ? publish.start : onRetry}
						>
							{t("publish.status.reprepare")}
						</Button>
					) : null}
					{publish.recovery ? (
						<Button size="small" disabled={publish.busy} onClick={publish.retryRecovery}>
							{publish.recovery === "finalize"
								? t("publish.status.recoveryFinalize")
								: t("publish.status.recoveryRead")}
						</Button>
					) : null}
				</>
			) : null}
		</>
	);
}
