import type { ChatProvider } from "@openagentpack/kit-sdk/providers";
import { createKitChatProvider, type KitClient } from "@openagentpack/kit-sdk/providers/kit";

// 兼容已经持有完整 KitClient 的应用。
export function wrapExistingKitClient(client: KitClient): ChatProvider {
	return createKitChatProvider(client);
}
