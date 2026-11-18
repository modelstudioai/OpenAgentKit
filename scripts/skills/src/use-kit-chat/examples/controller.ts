import {
	createChatController,
	createSessionStore,
	type SessionSnapshot,
	type SessionStoreOptions,
} from "@openagentpack/kit-sdk/chat";
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";

// 控制器可独立于 React 使用，由宿主负责销毁。
export function observeSession(
	provider: ChatProvider,
	sessionId: string,
	onChange: (snapshot: SessionSnapshot) => void,
) {
	const controller = createChatController(provider, sessionId);
	const unsubscribe = controller.subscribe(() => onChange(controller.getSnapshot()));
	const dispose = () => {
		unsubscribe();
		controller.dispose();
	};
	const ready = controller.connect().catch((error) => {
		dispose();
		throw error;
	});
	return { controller, ready, dispose };
}

// 直接使用 Store 时，宿主须通过 applyEvent 提供 SDK SessionEvent 快照，并管理生命周期。
// 常规对话接入用上面的控制器。
export function createLocalStore(sessionId: string, provider: ChatProvider) {
	const options: SessionStoreOptions = { transformMessage: provider.transformMessage?.bind(provider) };
	return createSessionStore(sessionId, options);
}
