import { type MaybeRefOrGetter, onScopeDispose, shallowRef, toValue, watch } from "vue";
import type { MemberAuthController } from "../member-auth.ts";

/**
 * 仅订阅与管理生命周期；认证、撤销和旧请求隔离统一由 SDK 数据处理层执行。
 * 返回的 `snapshot` 是 Ref，模板中自动解包；`login` 等方法始终指向当前 controller。
 */
export function useMemberAuth(source: MaybeRefOrGetter<MemberAuthController>) {
	const controller = toValue(source);
	const snapshot = shallowRef(controller.getSnapshot());
	let mountEpoch = 0;
	let current = controller;
	let disposed = false;

	function publish() {
		snapshot.value = current.getSnapshot();
	}

	function bind(next: MemberAuthController) {
		current = next;
		const epoch = ++mountEpoch;
		const unsubscribe = next.subscribe(publish);
		publish();
		void next.start().catch(() => undefined);
		return () => {
			unsubscribe();
			queueMicrotask(() => {
				if (current !== next || mountEpoch === epoch) next.dispose();
			});
		};
	}

	let cleanup = bind(controller);
	onScopeDispose(() => {
		if (disposed) return;
		disposed = true;
		cleanup();
	});
	watch(
		() => toValue(source),
		(next) => {
			if (next === current) return;
			cleanup();
			cleanup = bind(next);
		},
	);

	return {
		snapshot,
		login: (input: Parameters<MemberAuthController["login"]>[0]) => current.login(input),
		logout: () => current.logout(),
		retry: () => current.retry(),
		dispose: () => cleanup(),
	};
}
