import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TemplateMemoryEntry } from "./template-memory-draft.ts";
import styles from "./template-resources.module.less";

/** 创建与详情共用条目路径/正文展示，详情不传编辑操作。 */
export function TemplateMemoryEntryList({
	value,
	actions,
}: {
	value: TemplateMemoryEntry[];
	actions?: (entry: TemplateMemoryEntry) => ReactNode;
}) {
	const { t } = useTranslation("templates");
	if (!value.length) return <p className={styles.mutedOnly}>{t("memory.entries.empty")}</p>;
	return (
		<ul aria-label={t("memory.entries.listAria")} className={styles.entryList}>
			{value.map((entry) => (
				<li key={entry.id} className={styles.entryItem}>
					<div className={styles.entryHead}>
						<span className={styles.entryKey}>{entry.key}</span>
						{actions ? <div className={styles.entryActions}>{actions(entry)}</div> : null}
					</div>
					<pre className={styles.entryBody}>{entry.content || t("memory.entries.emptyContent")}</pre>
				</li>
			))}
		</ul>
	);
}
