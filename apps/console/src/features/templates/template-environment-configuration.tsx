import { ErrorState } from "@openagentpack/kit-chat-ui";
import { Button, Drawer } from "antd";
import { type Ref, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type EnvironmentFormHandle,
	type EnvironmentFormState,
	TemplateEnvironmentForm,
} from "./template-environment-form.tsx";
import { TemplateEnvironmentList } from "./template-environment-list.tsx";
import styles from "./template-forms.module.less";
import type { TemplateEnvironmentSelection } from "./template-local-resources.tsx";
import { useTemplateEnvironmentDetail } from "./use-template-environment-detail.ts";

function EnvironmentPicker({
	selected,
	onSelect,
}: {
	selected: TemplateEnvironmentSelection | null;
	onSelect: (environment: TemplateEnvironmentSelection) => void;
}) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	return (
		<>
			<Button className={styles.pickerButton} onClick={() => setOpen(true)}>
				{t("agent.environment.config.importExisting")}
			</Button>
			<Drawer
				open={open}
				onClose={() => setOpen(false)}
				destroyOnHidden
				width={768}
				title={<div className={styles.drawerTitle}>{t("agent.environment.config.choose")}</div>}
			>
				<TemplateEnvironmentList
					selected={selected}
					search={search}
					onSearchChange={setSearch}
					onSelect={(environment) => {
						onSelect(environment);
						setOpen(false);
					}}
				/>
			</Drawer>
		</>
	);
}

export function TemplateEnvironmentConfiguration({
	selected,
	revision,
	onSelect,
	formRef,
	onStateChange,
	onPendingChange,
	onClear,
}: {
	selected: TemplateEnvironmentSelection | null;
	revision: number;
	onSelect: (environment: TemplateEnvironmentSelection) => void;
	formRef: Ref<EnvironmentFormHandle>;
	onStateChange: (state: EnvironmentFormState) => void;
	onPendingChange?: (pending: boolean) => void;
	onClear: () => void;
}) {
	const { t } = useTranslation("templates");
	const detail = useTemplateEnvironmentDetail(selected, revision);
	const ready = !selected || Boolean(!detail.loading && !detail.error && detail.data);
	useEffect(() => {
		if (!ready) onStateChange({ dirty: false, valid: false });
	}, [ready, onStateChange]);
	return (
		<section aria-label={t("agent.environment.config.title")} className={styles.configRoot}>
			<header className={styles.configHeader}>
				<h3 className={styles.sectionTitle}>{t("agent.environment.config.title")}</h3>
				<p className={styles.configHint}>{t("agent.environment.config.hint")}</p>
			</header>
			<div className={styles.configBody}>
				<div className={styles.rowStart}>
					<EnvironmentPicker selected={selected} onSelect={onSelect} />
					<Button onClick={onClear}>{t("agent.environment.config.clear")}</Button>
				</div>
				{detail.error ? <ErrorState message={detail.error} onRetry={() => void detail.refresh()} /> : null}
				{ready ? (
					<TemplateEnvironmentForm
						key={`${selected?.environment_id}:${revision}`}
						selected={selected}
						detail={selected ? detail.data : undefined}
						ref={formRef}
						onStateChange={onStateChange}
						onPendingChange={onPendingChange}
					/>
				) : (
					<p role="status">
						{detail.error ? t("agent.environment.config.loadFailed") : t("agent.environment.config.loading")}
					</p>
				)}
			</div>
		</section>
	);
}
