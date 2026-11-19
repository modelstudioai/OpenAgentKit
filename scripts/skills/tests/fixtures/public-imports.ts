import {
	type ChatController,
	createChatController,
	createSessionStore,
	type SessionStoreOptions,
} from "@openagentkit/sdk/chat";
import type { UseChatOptions, UseChatResult } from "@openagentkit/sdk/chat/hooks";
import { type MessageTransformer, transformSessionEvent } from "@openagentkit/sdk/messages";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import { streamProtocolFrames } from "@openagentkit/sdk/providers/kit";
import type { createRequest as requestEntry } from "@openagentkit/sdk/request";
import { createRequest } from "@openagentkit/sdk/request";
import { createMutation, createObservable, createQuery } from "@openagentkit/sdk/state";
import type { createSseStream as streamEntry } from "@openagentkit/sdk/stream";
import { createSseStream } from "@openagentkit/sdk/stream";

const localState = createObservable({ editing: false });
const query = createQuery(async () => "value");
const mutation = createMutation(async (value: string) => value);
const chatOptions: UseChatOptions = { sessionId: null, provider: null as unknown as ChatProvider };
const chatResult: UseChatResult | null = null;
const controllerSnapshot = (controller: ChatController): ReturnType<ChatController["getSnapshot"]> =>
	controller.getSnapshot();
const rootRequest: typeof requestEntry = createRequest;
const rootStream: typeof streamEntry = createSseStream;
void [
	localState,
	query,
	mutation,
	streamProtocolFrames,
	chatOptions,
	chatResult,
	controllerSnapshot,
	rootRequest,
	rootStream,
];

// Existing five-operation providers remain valid; standalone stores can use the same conversion.
export function messageProjectionConsumer(legacyProvider: Omit<ChatProvider, "transformMessage">) {
	const provider: ChatProvider = legacyProvider;
	const transformMessage: MessageTransformer = transformSessionEvent;
	const options: SessionStoreOptions = { transformMessage };
	return { controller: createChatController(provider, "session"), store: createSessionStore("session", options) };
}
