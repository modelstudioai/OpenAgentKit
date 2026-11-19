import type { ChatProvider } from "@openagentkit/sdk/providers";
import { createKitChatProvider, type KitClient } from "@openagentkit/sdk/providers/kit";

// 兼容已经持有完整 KitClient 的应用。
export function wrapExistingKitClient(client: KitClient): ChatProvider {
	return createKitChatProvider(client);
}
