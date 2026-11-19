import type { ApplyRequest, CatalogAgentView, TemplateView } from "@openagentkit/sdk/protocol";
import { Modal } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminApi, getAdminClient } from "../../lib/api.ts";
import styles from "./template-pages.module.less";

/** 上下架均只展示一次确认；后台自动准备只读计划，用户确认后才提交。 */
export function TemplateListingDialog({
	template,
	onClose,
	onUpdated,
	onPendingChange,
}: {
	template: TemplateView;
	onClose: () => void;
	onUpdated: (catalog: CatalogAgentView) => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const listing = template.listing;
	const unlisting = listing?.status === "listed";
	const action = unlisting ? t("actions.unlist") : t("actions.list");
	const displayName = (template.listing?.display_name ?? template.name).trim().slice(0, 60).trimEnd();
	const [phase, setPhase] = useState<"plan" | "confirm">("plan");
	const plan = useAdminQuery<ApplyRequest>(`templates:listing:${template.template_id}:${action}:${displayName}`, () =>
		unlisting
			? adminApi.catalog.plan(listing.slug, "unlisted")
			: client.templates.planListing(template.template_id, { display_name: displayName }),
	);
	const confirm = useAdminMutation((prepared: ApplyRequest) => {
		const confirmation = {
			plan_id: prepared.plan_id,
			confirm_token: prepared.confirm_token,
		};
		return unlisting
			? adminApi.catalog.setStatus(listing.slug, "unlisted", confirmation)
			: client.templates.confirmListing(template.template_id, { display_name: displayName, ...confirmation });
	});
	const preparing = plan.loading || (!plan.data && !plan.error);
	const busy = preparing || confirm.pending;
	const error = phase === "plan" ? plan.error : confirm.error;
	useEffect(() => {
		onPendingChange(busy);
		return () => onPendingChange(false);
	}, [busy, onPendingChange]);
	const message = unlisting
		? t("listing.unlistMessage", { name: displayName })
		: t("listing.listMessage", { name: displayName, note: listing ? t("listing.updateNote") : "" });
	return (
		<Modal
			open
			centered
			title={t("listing.title", { action })}
			okText={preparing ? t("listing.preparing") : error ? t("retry") : t("listing.confirm", { action })}
			okButtonProps={{ danger: unlisting, loading: busy }}
			cancelText={t("cancel")}
			onCancel={onClose}
			onOk={() => {
				if (busy) return;
				if (error || !plan.data) {
					setPhase("plan");
					void plan.refresh();
					return;
				}
				setPhase("confirm");
				void confirm
					.run(plan.data)
					.then(onUpdated)
					.catch(() => {});
			}}
		>
			<p className={styles.dialogMessage}>
				{error ? `${message}\n\n${t("listing.failed", { action, error })}` : message}
			</p>
		</Modal>
	);
}
