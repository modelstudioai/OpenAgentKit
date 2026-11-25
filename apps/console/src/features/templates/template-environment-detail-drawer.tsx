import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import { Button, Drawer } from "antd";
import { useTranslation } from "react-i18next";
import { EnvironmentDetailView } from "./environment-detail-view.tsx";
import type { TemplateEnvironmentSelection } from "./template-local-resources.tsx";
import styles from "./template-resources.module.less";
import { useTemplateEnvironmentDetail } from "./use-template-environment-detail.ts";

/** 查看环境不改变草稿选择；抽屉打开才读取，关闭后释放详情查询。 */
export function TemplateEnvironmentDetailDrawer({
	environment,
	open,
	onClose,
	onSelect,
}: {
	environment: TemplateEnvironmentSelection;
	open: boolean;
	onClose: () => void;
	onSelect?: () => void;
}) {
	const { t } = useTranslation("templates");
	const detail = useTemplateEnvironmentDetail(open ? environment : null);
	return (
		<Drawer
			open={open}
			onClose={onClose}
			destroyOnHidden
			width={672}
			title={<div className={styles.drawerTitle}>{t("agent.environment.detail.title")}</div>}
			footer={
				onSelect ? (
					<div className={styles.rowEnd}>
						<Button
							type="primary"
							disabled={detail.loading || Boolean(detail.error) || !detail.data}
							onClick={() => {
								onClose();
								onSelect();
							}}
						>
							{t("agent.environment.detail.confirm")}
						</Button>
					</div>
				) : undefined
			}
		>
			{detail.error ? (
				<ErrorState message={detail.error} onRetry={() => void detail.refresh()} />
			) : detail.loading || !detail.data ? (
				<EmptyState loading title={t("agent.environment.detail.loading")} />
			) : (
				<EnvironmentDetailView detail={detail.data} />
			)}
		</Drawer>
	);
}
