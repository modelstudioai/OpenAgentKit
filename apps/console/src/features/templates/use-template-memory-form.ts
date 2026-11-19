import { KitError } from "@openagentpack/kit-sdk/protocol";
import i18n from "i18next";
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminApi, getAdminClient } from "../../lib/api.ts";
import { useTemplateLocalResources } from "./template-local-resources.tsx";
import {
	hasPendingMemories,
	memoryCreateInput,
	prepareTemplateMemories,
	type TemplateMemoryDraft,
} from "./template-memory-draft.ts";
import { useTemplateResourceDraft } from "./template-resource-draft.tsx";
import { useTemplateDraftProject } from "./use-template-draft-project.ts";

export type MemoryFormHandle = { save: () => Promise<TemplateMemoryDraft[]> };
export function useTemplateMemoryForm(
	value: TemplateMemoryDraft[],
	onChange: (value: TemplateMemoryDraft[]) => void,
	ref: Ref<MemoryFormHandle>,
	editing: boolean,
	onPendingChange?: (pending: boolean) => void,
) {
	const client = useMemo(getAdminClient, []);
	const identity = useAdminQuery("templates:memory-form:identity", (signal) => client.identity(signal));
	const names = useAdminQuery("templates:memory-form:names", (signal) => adminApi.remoteMemoryStores(signal), {
		enabled: value.some((row) => !row.creation && !row.name),
	});
	const project = useTemplateDraftProject("memory-inline", false);
	const local = useTemplateLocalResources();
	const resources = useTemplateResourceDraft();
	const active = useRef(true);
	const uncertain = useRef(false);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const dirty = hasPendingMemories(value);
	const save = useAdminMutation(() => {
		const t = i18n.getFixedT(null, "templates");
		if (!dirty) return Promise.resolve(value);
		if (uncertain.current) throw new Error(t("memory.errors.uncertain"));
		if (identity.data?.role !== "admin") throw new Error(t("memory.errors.notAdmin"));
		return prepareTemplateMemories(
			value,
			async (row) => {
				const current = await project.prepare();
				if (!active.current) throw new Error(t("memory.errors.cancelled"));
				if (current.overview.active_mutation) throw new Error(t("memory.errors.projectBusy"));
				const result = await client.draftResources
					.createMemoryStore(current.draft_id, memoryCreateInput(row, current.overview.project_revision))
					.catch((error: unknown) => {
						if (
							error instanceof KitError &&
							["conflict", "invalid_request", "not_found", "forbidden", "unauthorized"].includes(error.code)
						)
							throw error;
						uncertain.current = true;
						throw new Error(t("memory.errors.uncertain"));
					});
				if (!active.current) throw new Error(t("memory.errors.cancelled"));
				return local.addMemory(result, current.draft_id);
			},
			(prepared) => flushSync(() => onChange(prepared)),
		);
	});
	useImperativeHandle(ref, () => ({ save: () => save.run() }));
	const busy = save.pending || project.projects.loading;
	useEffect(() => {
		onPendingChange?.(busy || editing);
		return () => onPendingChange?.(false);
	}, [busy, editing, onPendingChange]);
	useEffect(() => {
		resources.setMemoryDirty(dirty);
		return () => resources.setMemoryDirty(false);
	}, [dirty, resources.setMemoryDirty]);
	return { identity, names, busy, error: save.error || project.projects.error };
}
