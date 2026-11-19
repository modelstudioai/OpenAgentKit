import { useIsMobile } from "@openagentkit/sdk/hooks";
import type { PlazaCategory, TemplatesQuery, TemplateView } from "@openagentkit/sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, Empty, Input, Result, Select, Table } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { PLAZA_CATEGORIES, plazaCategoryLabel } from "../catalog/plaza-categories.ts";
import { useConsoleRoute } from "../navigation/console-router.tsx";
import { EditTemplatePage } from "./edit-template-page.tsx";
import { TemplateDeleteDialog } from "./template-delete-dialog.tsx";
import { TemplateDetail } from "./template-detail.tsx";
import { useTemplateConfigurationColumns } from "./template-list-configuration.tsx";
import { TemplateListingDialog } from "./template-listing-dialog.tsx";
import styles from "./template-pages.module.less";

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;
type TemplateAction = { kind: "listing" | "delete"; template: TemplateView };
type TemplateStatusFilter = "" | NonNullable<TemplatesQuery["status"]>;
type TemplateCategoryFilter = "" | PlazaCategory;

function useTemplateList(client: ReturnType<typeof getAdminClient>, paused: boolean) {
	const [search, setSearch] = useState("");
	const [composing, setComposing] = useState(false);
	const [query, setQuery] = useState({
		search: "",
		status: "" as TemplateStatusFilter,
		category: "" as TemplateCategoryFilter,
		cursors: [""],
		revision: 0,
	});
	const searchPending = composing || search.trim() !== query.search;
	useEffect(() => {
		if (composing || paused || search.trim() === query.search) return;
		const timer = setTimeout(() => {
			setQuery((current) => ({ ...current, search: search.trim(), cursors: [""], revision: current.revision + 1 }));
		}, SEARCH_DELAY_MS);
		return () => clearTimeout(timer);
	}, [search, composing, paused, query.search]);
	const changeFilter = (patch: Partial<Pick<typeof query, "status" | "category">>) =>
		setQuery((current) => ({
			...current,
			search: composing ? current.search : search.trim(),
			...patch,
			cursors: [""],
			revision: current.revision + 1,
		}));
	const list = useAdminQuery(`templates:list:${JSON.stringify(query)}`, (signal) =>
		client.templates.list(
			{
				search: query.search,
				status: query.status || undefined,
				category: query.category || undefined,
				limit: PAGE_SIZE,
				page_token: query.cursors.at(-1) || undefined,
			},
			signal,
		),
	);
	const loading = list.loading || (!list.data && !list.error);
	const rows = !loading && !list.error ? (list.data?.data ?? []) : [];
	const nextCursor = list.data?.next_page_token;
	const refreshAfterRemoval = () =>
		setQuery((current) => ({
			...current,
			cursors: rows.length === 1 && current.cursors.length > 1 ? current.cursors.slice(0, -1) : current.cursors,
			revision: current.revision + 1,
		}));
	const refreshAfterUpdate = (template: TemplateView) => {
		const removed = query.category && template.category !== query.category;
		if (removed && rows.some((row) => row.template_id === template.template_id)) refreshAfterRemoval();
		else void list.refresh();
	};
	return {
		search,
		setSearch,
		setComposing,
		searchPending,
		changeFilter,
		list,
		query,
		setQuery,
		loading,
		rows,
		nextCursor,
		refreshAfterRemoval,
		refreshAfterUpdate,
	};
}

function TemplateListFilters({
	search,
	setSearch,
	setComposing,
	status,
	changeStatus,
	category,
	changeCategory,
	busy,
}: {
	search: string;
	setSearch: (value: string) => void;
	setComposing: (value: boolean) => void;
	status: TemplateStatusFilter;
	changeStatus: (value: TemplateStatusFilter) => void;
	category: TemplateCategoryFilter;
	changeCategory: (value: TemplateCategoryFilter) => void;
	busy: boolean;
}) {
	const { t } = useTranslation("templates");
	const { t: tc } = useTranslation("catalog");
	return (
		<div className={styles.filterRow}>
			<Input
				type="search"
				aria-label={t("list.searchAria")}
				placeholder={t("list.searchPlaceholder")}
				maxLength={254}
				disabled={busy}
				value={search}
				onChange={(event) => setSearch(event.target.value)}
				onCompositionStart={() => setComposing(true)}
				onCompositionEnd={(event) => {
					setComposing(false);
					setSearch(event.currentTarget.value);
				}}
				className={styles.searchWide}
			/>
			<div className={styles.filterGroup}>
				<span>{t("list.statusFilter")}</span>
				<Select
					aria-label={t("list.statusFilter")}
					className={styles.selectStatus}
					value={status}
					disabled={busy}
					options={[
						{ value: "", label: t("status.all") },
						{ value: "listed", label: t("status.listed") },
						{ value: "unlisted", label: t("status.unlisted") },
					]}
					onChange={(value) => changeStatus(value as TemplateStatusFilter)}
				/>
			</div>
			<div className={styles.filterGroup}>
				<span>{t("category")}</span>
				<Select
					aria-label={t("category")}
					className={styles.selectCategory}
					value={category}
					disabled={busy}
					options={[
						{ value: "", label: t("status.all") },
						...PLAZA_CATEGORIES.map((value) => ({ value, label: plazaCategoryLabel(value, tc) })),
					]}
					onChange={(value) => changeCategory(value as TemplateCategoryFilter)}
				/>
			</div>
		</div>
	);
}

export function TemplateListPage({
	onCreate,
	savedName,
	onPendingChange,
}: {
	onCreate: () => void;
	savedName?: string;
	onPendingChange?: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const identity = useAdminQuery("templates:list:identity", (signal) => client.identity(signal));
	const { route, navigate, complete } = useConsoleRoute();
	const selected = route.page === "template-detail" ? route.id : undefined;
	const editingId = route.page === "template-edit" ? route.id : undefined;
	const setSelected = (id: string | null, tab?: "debug") =>
		navigate(id ? { page: "template-detail", id, tab } : { page: "template-list" });
	const setEditingId = (id: string | null) => navigate(id ? { page: "template-edit", id } : { page: "template-list" });
	const [action, setAction] = useState<TemplateAction | null>(null);
	const [actionBusy, setActionBusy] = useState(false);
	const [notice, setNotice] = useState<string>();
	const {
		search,
		setSearch,
		setComposing,
		searchPending,
		changeFilter,
		list,
		query,
		setQuery,
		loading,
		rows,
		nextCursor,
		refreshAfterRemoval,
		refreshAfterUpdate,
	} = useTemplateList(client, Boolean(action || editingId || selected));
	const resultBusy = actionBusy || searchPending;
	const filtersActive = Boolean(query.search || query.status || query.category);
	useEffect(() => {
		onPendingChange?.(actionBusy);
		return () => onPendingChange?.(false);
	}, [actionBusy, onPendingChange]);
	if (editingId)
		return (
			<EditTemplatePage
				key={editingId}
				id={editingId}
				onBack={() => setEditingId(null)}
				onPendingChange={onPendingChange}
				onSaved={(template) => {
					setNotice(t("list.updated", { name: template.name }));
					complete({ page: "template-list" });
					refreshAfterUpdate(template);
				}}
			/>
		);
	if (selected)
		return (
			<TemplateDetail
				key={selected}
				id={selected}
				onBack={() => setSelected(null)}
				onEdit={() => setEditingId(selected)}
				onPendingChange={setActionBusy}
				onApplied={(template) => {
					setNotice(t("list.updated", { name: template.name }));
					refreshAfterUpdate(template);
				}}
			/>
		);
	return (
		<section aria-label={t("list.aria")} className={styles.pageStack}>
			<header className={styles.rowBetween}>
				<h2 className={styles.pageTitle}>{t("list.title")}</h2>
				{identity.data?.role === "admin" ? (
					<Button type="primary" disabled={actionBusy} onClick={onCreate}>
						{t("list.create")}
					</Button>
				) : null}
			</header>
			<TemplateListNotice savedName={savedName} notice={notice} />
			<TemplateListFilters
				search={search}
				setSearch={setSearch}
				setComposing={setComposing}
				status={query.status}
				changeStatus={(status) => changeFilter({ status })}
				category={query.category}
				changeCategory={(category) => changeFilter({ category })}
				busy={actionBusy}
			/>
			{identity.error ? (
				<Result
					status="error"
					title={identity.error}
					extra={<Button onClick={() => void identity.refresh()}>{t("retry")}</Button>}
				/>
			) : null}
			{list.error ? (
				<Result
					status="error"
					title={list.error}
					extra={<Button onClick={() => void list.refresh()}>{t("retry")}</Button>}
				/>
			) : null}
			{!list.error ? (
				<TemplateTable
					rows={rows}
					loading={loading}
					filtered={filtersActive}
					onSelect={setSelected}
					canManage={identity.data?.role === "admin"}
					busy={resultBusy}
					onAction={setAction}
					onEdit={setEditingId}
				/>
			) : null}
			<TemplatePagination
				page={query.cursors.length}
				hasNext={Boolean(nextCursor)}
				loading={loading || resultBusy}
				onPrevious={() => setQuery((current) => ({ ...current, cursors: current.cursors.slice(0, -1) }))}
				onNext={() => {
					if (nextCursor) setQuery((current) => ({ ...current, cursors: [...current.cursors, nextCursor] }));
				}}
			/>
			<TemplateActionDialog
				action={action}
				onClose={() => setAction(null)}
				onPendingChange={setActionBusy}
				onComplete={(message, deleted) => {
					setNotice(message);
					setAction(null);
					if (deleted || query.status) refreshAfterRemoval();
					else void list.refresh();
				}}
			/>
		</section>
	);
}

function TemplateEmptyState({ filtered }: { filtered: boolean }) {
	const { t } = useTranslation("templates");
	return (
		<Empty
			description={
				<span className={styles.mutedOnly}>
					{filtered ? t("list.emptyFilteredTitle") : t("list.emptyTitle")}
					<br />
					<span className={styles.textXs}>{filtered ? t("list.emptyFilteredHint") : t("list.emptyHint")}</span>
				</span>
			}
		/>
	);
}

function TemplateListNotice({ savedName, notice }: { savedName?: string; notice?: string }) {
	const { t } = useTranslation("templates");
	const message = notice ?? (savedName ? t("list.saved", { name: savedName }) : undefined);
	if (!message) return null;
	return (
		<p role="status" className={styles.successAny}>
			{message}
		</p>
	);
}

function TemplateTime({ value }: { value?: string }) {
	return value ? <time dateTime={value}>{new Date(value).toLocaleString("zh-CN", { hour12: false })}</time> : "—";
}

function TemplateTable({
	rows,
	loading,
	filtered,
	onSelect,
	canManage,
	busy,
	onAction,
	onEdit,
}: {
	rows: TemplateView[];
	loading: boolean;
	filtered: boolean;
	onSelect: (id: string, tab?: "debug") => void;
	canManage: boolean;
	busy: boolean;
	onAction: (action: TemplateAction) => void;
	onEdit: (id: string) => void;
}) {
	const { t } = useTranslation("templates");
	const { columns: configurationColumns, loading: configurationLoading } = useTemplateConfigurationColumns(rows);
	const narrow = useIsMobile();
	const tableLoading = loading || configurationLoading;
	const columns = [
		{
			key: "name",
			title: t("fields.name"),
			width: 200,
			fixed: narrow ? undefined : "left",
			render: (_, template: TemplateView) => (
				<div className={styles.nameCellWide}>
					<span className={styles.nameAny}>{template.name}</span>
				</div>
			),
		},
		...configurationColumns,
		{
			title: t("fields.savedAt"),
			render: (_, template: TemplateView) => (
				<span className={styles.nowrapMuted}>
					<TemplateTime value={template.created_at} />
				</span>
			),
		},
		{
			title: t("fields.status"),
			render: (_, template: TemplateView) => (
				<span className={template.listing?.status === "listed" ? styles.nowrapSuccess : styles.nowrapMuted}>
					{template.listing?.status === "listed" ? t("status.listed") : t("status.unlisted")}
				</span>
			),
		},
		{
			title: t("fields.listedAt"),
			render: (_, template: TemplateView) => (
				<span className={styles.nowrapMuted}>
					<TemplateTime value={template.listing?.listed_at} />
				</span>
			),
		},
		{
			title: t("fields.actions"),
			fixed: narrow ? undefined : "right",
			width: 300,
			render: (_, template: TemplateView) => (
				<TemplateActions
					template={template}
					onSelect={onSelect}
					canManage={canManage}
					busy={busy || tableLoading}
					onAction={onAction}
					onEdit={onEdit}
				/>
			),
		},
	] satisfies TableColumnsType<TemplateView>;
	return (
		<Table
			rowKey="template_id"
			size="middle"
			columns={columns}
			dataSource={rows}
			loading={tableLoading}
			locale={{ emptyText: tableLoading ? null : <TemplateEmptyState filtered={filtered} /> }}
			pagination={false}
			scroll={{ x: "max-content" }}
			sticky
		/>
	);
}

function TemplateActions({
	template,
	onSelect,
	canManage,
	busy,
	onAction,
	onEdit,
}: {
	template: TemplateView;
	onSelect: (id: string, tab?: "debug") => void;
	canManage: boolean;
	busy: boolean;
	onAction: (action: TemplateAction) => void;
	onEdit: (id: string) => void;
}) {
	const { t } = useTranslation("templates");
	return (
		<div className={styles.actionsRow}>
			<Button
				type="link"
				size="small"
				aria-label={t("actions.viewAria", { name: template.name })}
				disabled={busy}
				onClick={() => onSelect(template.template_id)}
			>
				{t("actions.view")}
			</Button>
			{canManage ? (
				<Button
					type="link"
					size="small"
					aria-label={t("actions.editAria", { name: template.name })}
					disabled={busy}
					onClick={() => onEdit(template.template_id)}
				>
					{t("actions.edit")}
				</Button>
			) : null}
			{canManage ? (
				<Button
					type="link"
					size="small"
					aria-label={t("actions.debugAria", { name: template.name })}
					disabled={busy}
					onClick={() => onSelect(template.template_id, "debug")}
				>
					{t("actions.debug")}
				</Button>
			) : null}
			{canManage ? (
				<Button
					type="link"
					size="small"
					aria-label={t("actions.listingAria", {
						action: template.listing?.status === "listed" ? t("actions.unlist") : t("actions.list"),
						name: template.name,
					})}
					disabled={busy}
					onClick={() => onAction({ kind: "listing", template })}
				>
					{template.listing?.status === "listed" ? t("actions.unlist") : t("actions.list")}
				</Button>
			) : null}
			{canManage ? (
				<Button
					type="link"
					size="small"
					danger
					aria-label={t("actions.deleteAria", { name: template.name })}
					disabled={busy}
					onClick={() => onAction({ kind: "delete", template })}
				>
					{t("actions.delete")}
				</Button>
			) : null}
		</div>
	);
}

function TemplateActionDialog({
	action,
	onClose,
	onComplete,
	onPendingChange,
}: {
	action: TemplateAction | null;
	onClose: () => void;
	onComplete: (message: string, deleted?: boolean) => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	if (!action) return null;
	const template = action.template;
	if (action.kind === "delete")
		return (
			<TemplateDeleteDialog
				key={template.template_id}
				template={template}
				onClose={onClose}
				onPendingChange={onPendingChange}
				onDeleted={() => onComplete(t("list.deleted", { name: template.name }), true)}
			/>
		);
	return (
		<TemplateListingDialog
			key={template.template_id}
			template={template}
			onClose={onClose}
			onPendingChange={onPendingChange}
			onUpdated={(catalog) =>
				onComplete(
					t("list.listingUpdated", {
						name: template.name,
						action: catalog.status === "listed" ? t("status.listed") : t("status.unlisted"),
					}),
				)
			}
		/>
	);
}

function TemplatePagination({
	page,
	hasNext,
	loading,
	onPrevious,
	onNext,
}: {
	page: number;
	hasNext: boolean;
	loading: boolean;
	onPrevious: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation("templates");
	if (page === 1 && !hasNext) return null;
	return (
		<nav aria-label={t("pagination.aria")} className={styles.rowEnd13}>
			<Button size="small" disabled={loading || page === 1} onClick={onPrevious}>
				{t("pagination.previous")}
			</Button>
			<span>{t("pagination.page", { page })}</span>
			<Button size="small" disabled={loading || !hasNext} onClick={onNext}>
				{t("pagination.next")}
			</Button>
		</nav>
	);
}
