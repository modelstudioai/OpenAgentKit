import type { MemberSessionUsage, MemberUsageSummary } from "@openagentkit/sdk/protocol";
import { createObservable } from "@openagentkit/sdk/state";
import i18n from "i18next";
import type { AdminClient } from "./client.ts";

type UsageAgent = MemberUsageSummary["agents"][number];

export function memberUsageAgentKey(agent?: UsageAgent): string {
	return agent ? JSON.stringify([agent.slug, agent.catalog_entry_id === undefined ? "" : agent.catalog_entry_id]) : "";
}

function usageFilter(agent?: UsageAgent) {
	return agent
		? { agent_slug: agent.slug, catalog_entry_id: agent.catalog_entry_id === null ? "" : agent.catalog_entry_id }
		: {};
}

export interface MemberUsageSnapshot {
	summary: MemberUsageSummary | undefined;
	sessions: MemberSessionUsage[];
	agent: UsageAgent | undefined;
	agents: MemberUsageSummary["agents"];
	page: number;
	hasNext: boolean;
	loading: boolean;
	error: string | null;
}

/** 成员累计值始终来自服务端全量汇总；分页仅改变明细，轮询只观察采集结果。 */
export function createMemberUsageController(client: Pick<AdminClient, "members">, memberId: string) {
	const store = createObservable<MemberUsageSnapshot>({
		summary: undefined,
		sessions: [],
		agent: undefined,
		agents: [],
		page: 1,
		hasNext: false,
		loading: true,
		error: null,
	});
	let cursors = [""];
	let nextCursor: string | undefined;
	let active: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;
	const update = (patch: Partial<MemberUsageSnapshot>) => {
		store.set({ ...store.getSnapshot(), ...patch });
	};
	async function load(refresh = false) {
		clearTimeout(timer);
		active?.abort();
		const controller = new AbortController();
		active = controller;
		const turn = ++generation;
		const current = () => turn === generation && !controller.signal.aborted;
		const filter = usageFilter(store.getSnapshot().agent);
		update({ loading: true, error: null });
		try {
			const [summary, sessions] = await Promise.all([
				client.members.usage(memberId, { ...filter, refresh }, controller.signal),
				client.members.sessions(
					memberId,
					{ ...filter, cursor: cursors.at(-1) || undefined, limit: 20 },
					controller.signal,
				),
			]);
			if (!current()) return;
			nextCursor = sessions.next_cursor;
			update({
				summary,
				agents: summary.agents,
				sessions: sessions.data,
				loading: false,
				hasNext: Boolean(nextCursor),
			});
			if (summary.refresh_status === "refreshing") timer = setTimeout(() => void load(), 2_000);
		} catch (error) {
			if (!current()) return;
			update({
				loading: false,
				error: error instanceof Error ? error.message : i18n.t("usagePage.loadFailed", { ns: "members" }),
			});
		}
	}
	return {
		getSnapshot: store.getSnapshot,
		subscribe: store.subscribe,
		start: () => load(),
		refresh: () => load(true),
		setAgent(agent?: UsageAgent) {
			if (memberUsageAgentKey(agent) === memberUsageAgentKey(store.getSnapshot().agent)) return;
			cursors = [""];
			nextCursor = undefined;
			update({ agent, summary: undefined, sessions: [], page: 1, hasNext: false });
			void load();
		},
		next() {
			if (store.getSnapshot().loading || !nextCursor) return;
			cursors = [...cursors, nextCursor];
			nextCursor = undefined;
			update({ page: cursors.length, sessions: [], hasNext: false });
			void load();
		},
		previous() {
			if (store.getSnapshot().loading || cursors.length < 2) return;
			cursors = cursors.slice(0, -1);
			nextCursor = undefined;
			update({ page: cursors.length, sessions: [], hasNext: false });
			void load();
		},
		dispose() {
			generation += 1;
			active?.abort();
			clearTimeout(timer);
		},
	};
}
