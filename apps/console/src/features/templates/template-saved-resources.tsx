import type { TemplateVersionView } from "@openagentkit/sdk/protocol";
import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { AgentVersionConfigurationView } from "./agent-version-configuration-view.tsx";
import { EnvironmentDetailView } from "./environment-detail-view.tsx";
import { TemplateMemoryEntryList } from "./template-memory-entry-list.tsx";
import styles from "./template-resources.module.less";
import { useTemplateAgentDetail } from "./use-template-agent-detail.ts";
import { useTemplateEnvironmentDetail } from "./use-template-environment-detail.ts";

function SavedResourceIdentity({ id, name }: { id: string; name?: string }) {
	return (
		<div className={styles.identity}>
			<p>{name || id}</p>
			{name && name !== id ? <p className={styles.identityId}>{id}</p> : null}
		</div>
	);
}

export function SavedAgentConfiguration({ template }: { template: TemplateVersionView }) {
	const { t } = useTranslation("templates");
	const version = template.agent_version ?? template.remote_agent_version;
	const detail = useTemplateAgentDetail(
		{ agent_id: template.remote_agent_id, name: template.remote_agent_name },
		version,
		template.version,
	);
	return (
		<div className={styles.stack4}>
			<AgentVersionConfigurationView
				detail={detail.data}
				versionLabel={version === undefined ? t("savedResources.notRecorded") : `v${version}`}
				nameContent={<SavedResourceIdentity id={template.remote_agent_id} name={template.remote_agent_name} />}
				placeholder={
					detail.error
						? t("savedResources.baseUnavailable")
						: detail.loading || !detail.data
							? t("savedResources.baseLoading")
							: undefined
				}
			/>
			{template.agent_version === undefined ? (
				<p className={styles.versionNote}>{t("savedResources.agentVersionNote")}</p>
			) : null}
			{detail.error ? <ErrorState message={detail.error} onRetry={() => void detail.refresh()} /> : null}
		</div>
	);
}

export function SavedEnvironmentConfiguration({ id, name }: { id: string; name?: string }) {
	const { t } = useTranslation("templates");
	const detail = useTemplateEnvironmentDetail({ environment_id: id, name: name || id });
	if (detail.error)
		return (
			<div className={styles.stack3}>
				<SavedResourceIdentity id={id} name={name} />
				<ErrorState message={detail.error} onRetry={() => void detail.refresh()} />
			</div>
		);
	if (detail.loading || !detail.data)
		return (
			<div className={styles.stack3}>
				<SavedResourceIdentity id={id} name={name} />
				<EmptyState loading title={t("savedResources.loadingEnvironment")} />
			</div>
		);
	return <EnvironmentDetailView detail={detail.data} />;
}

export function SavedMemoryConfiguration({ memory }: { memory: TemplateVersionView["memory_stores"][number] }) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const detail = useAdminQuery(`templates:saved-memory:${memory.memory_store_id}`, (signal) =>
		client.remoteMemoryStoreConfiguration(memory.memory_store_id, signal),
	);
	return (
		<div className={styles.memoryRoot}>
			<SavedResourceIdentity id={memory.memory_store_id} name={detail.data?.name} />
			<dl className={styles.stack3}>
				{detail.data ? (
					<div>
						<dt className={styles.termLabel}>{t("savedResources.description")}</dt>
						<dd className={styles.termValuePre}>{detail.data.description || t("savedResources.notConfigured")}</dd>
					</div>
				) : null}
				<div>
					<dt className={styles.termLabel}>{t("savedResources.access")}</dt>
					<dd className={styles.termValue}>
						{memory.access === "read_only" ? t("savedResources.readOnly") : t("savedResources.readWrite")}
					</dd>
				</div>
				<div>
					<dt className={styles.termLabel}>{t("savedResources.instructions")}</dt>
					<dd className={styles.termValuePre}>{memory.instructions || t("savedResources.notConfigured")}</dd>
				</div>
			</dl>
			{detail.error ? (
				<ErrorState message={detail.error} onRetry={() => void detail.refresh()} />
			) : detail.loading || !detail.data ? (
				<EmptyState loading title={t("memory.fields.loading")} />
			) : (
				<section aria-label={t("savedResources.entriesAria")} className={styles.stack3}>
					<h4 className={styles.entriesTitle}>{t("savedResources.entries", { count: detail.data.entries.length })}</h4>
					<TemplateMemoryEntryList value={detail.data.entries.map((entry) => ({ ...entry, id: entry.key }))} />
				</section>
			)}
			{detail.data?.copy_restricted_fields?.length ? (
				<p className={styles.versionNote}>
					{t("savedResources.hidden", {
						fields: detail.data.copy_restricted_fields.join(t("savedResources.separator")),
					})}
				</p>
			) : null}
		</div>
	);
}
