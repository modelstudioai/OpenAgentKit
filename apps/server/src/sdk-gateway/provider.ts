import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { KitError } from "@openagentkit/sdk/protocol";
import type { ProviderGateway } from "../gateway/types.ts";
import { errorBody } from "./http.ts";

const methods = [
	"createSession",
	"getSession",
	"sendMessage",
	"respondToolApproval",
	"interrupt",
	"archiveSession",
	"deleteSession",
	"mountSessionResource",
	"unmountSessionResource",
	"fileStatus",
	"listEvents",
	"listThreads",
	"listThreadEvents",
	"listRemoteAgents",
	"getPresetPackAgentResources",
	"getRemoteAgentResources",
	"getAgentMemoryStores",
	"listRemoteSkills",
	"getRemoteSkillVersion",
	"listRemoteAgentVersions",
	"getRemoteAgentVersion",
	"getRemoteAgentVersionDetail",
	"listRemoteEnvironments",
	"getRemoteEnvironment",
	"listRemoteFiles",
	"getRemoteFile",
	"listRemoteMemoryStores",
	"getRemoteMemoryStoreConfiguration",
	"getRemoteMemoryStore",
	"listRemoteVaults",
	"getRemoteVault",
	"listModelUsage",
	"listToolUsage",
	"getRemoteVaultDetail",
] as const satisfies ReadonlyArray<keyof ProviderGateway>;

export function providerMethods(gateway: ProviderGateway) {
	return new Map(
		methods.map((name) => [name, gateway[name].bind(gateway) as (...args: unknown[]) => Promise<unknown>] as const),
	);
}

function frame(type: string, data: unknown) {
	return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function streamProvider(
	gateway: ProviderGateway,
	response: ServerResponse,
	sessionId: string,
	afterId: string | undefined,
): Promise<void> {
	const abort = new AbortController();
	let ready = false;
	const closed = () => abort.abort();
	response.once("close", closed);
	response.writeHead(200, {
		"content-type": "text/event-stream",
		"cache-control": "no-cache, no-transform",
		"x-accel-buffering": "no",
	});
	response.flushHeaders();
	const heartbeat = setInterval(() => {
		if (ready && !abort.signal.aborted && !response.writableNeedDrain) {
			response.write(frame("ping", { t: Date.now() }));
		}
	}, 15_000);
	try {
		const options = {
			afterId,
			signal: abort.signal,
			onReady: () => {
				if (!abort.signal.aborted) {
					ready = true;
					response.write(frame("ready", {}));
				}
			},
		};
		for await (const event of gateway.streamEvents(sessionId, options)) {
			if (abort.signal.aborted) break;
			if (!response.write(frame("event", event))) await once(response, "drain", { signal: abort.signal });
		}
	} catch (error) {
		if (!abort.signal.aborted) response.write(frame("error", errorBody(error)));
	} finally {
		clearInterval(heartbeat);
		response.off("close", closed);
		if (!response.destroyed) response.end();
	}
}

export async function upload(gateway: ProviderGateway, input: unknown, uploadMax: number) {
	const value = input as { filename?: unknown; mimeType?: unknown; bytes?: unknown } | null;
	if (!value || typeof value.filename !== "string" || typeof value.bytes !== "string") {
		throw new KitError("invalid_request", "附件参数无效");
	}
	const bytes = Buffer.from(value.bytes, "base64");
	if (bytes.length > uploadMax) throw new KitError("invalid_request", "附件超过上限");
	return gateway.uploadFile({
		filename: value.filename,
		bytes,
		...(typeof value.mimeType === "string" ? { mimeType: value.mimeType } : {}),
	});
}
