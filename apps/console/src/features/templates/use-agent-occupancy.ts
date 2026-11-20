import { useMemo } from "react";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";

/** 全量模版（含已删标记）提供远端 Agent 占用映射；加载中返回空表，服务端仍会兜底拒绝。 */
export function useAgentOccupancy(): Map<string, string> {
	const client = useMemo(getAdminClient, []);
	const occupancy = useAdminQuery("usage:templates", (signal) => client.usage.templates({}, signal));
	return useMemo(() => {
		const map = new Map<string, string>();
		for (const row of occupancy.data ?? []) if (!row.deleted) map.set(row.remote_agent_id, row.name);
		return map;
	}, [occupancy.data]);
}
