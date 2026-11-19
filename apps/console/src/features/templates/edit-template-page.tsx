import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import type { TemplateView } from "@openagentpack/kit-sdk/protocol";
import { Button } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { TemplateEditorPage } from "./template-editor-page.tsx";
import styles from "./template-pages.module.less";

export function EditTemplatePage({
	id,
	onBack,
	onSaved,
	onPendingChange,
}: {
	id: string;
	onBack: () => void;
	onSaved: (template: TemplateView) => void;
	onPendingChange?: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const detail = useAdminQuery(`templates:edit:${id}`, (signal) => client.templates.get(id, signal));
	if (!detail.loading && !detail.error && detail.data)
		return (
			<TemplateEditorPage
				initialTemplate={detail.data}
				onCancel={onBack}
				onSaved={onSaved}
				onPendingChange={onPendingChange}
			/>
		);
	return (
		<section aria-label={t("edit.aria")} className={styles.pageStack}>
			<Button onClick={onBack}>{t("edit.backToList")}</Button>
			{detail.error ? (
				<ErrorState message={detail.error} onRetry={() => void detail.refresh()} />
			) : (
				<EmptyState loading title={t("edit.loading")} />
			)}
		</section>
	);
}
