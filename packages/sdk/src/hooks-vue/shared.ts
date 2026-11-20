import {
	computed,
	type MaybeRefOrGetter,
	onMounted,
	onScopeDispose,
	type ShallowRef,
	shallowRef,
	toValue,
	watch,
} from "vue";
import { createQuery } from "../state.ts";

/**
 * 延迟释放：与 React 版一致，卸载后等到微任务再 dispose，
 * 避免同一 tick 内的重复挂载把仍然存活的实例误杀。
 */
export function useLifecycle(controller: { dispose(): void }, start?: () => void) {
	onMounted(() => {
		start?.();
	});
	onScopeDispose(() => {
		queueMicrotask(() => controller.dispose());
	});
}

/** 订阅式快照：只替换浅引用，快照本身每次都是新对象。 */
export function useSnapshot<T>(controller: {
	getSnapshot(): T;
	subscribe(listener: () => void): () => void;
}): ShallowRef<T> {
	const snapshot = shallowRef(controller.getSnapshot()) as ShallowRef<T>;
	const stop = controller.subscribe(() => {
		snapshot.value = controller.getSnapshot();
	});
	onScopeDispose(stop);
	return snapshot;
}

/** 公共查询：挂载时按 enabled 拉取；enabled 打开或 watchSource 变化时重取。 */
export function usePublicQuery<T>(
	load: (signal: AbortSignal) => Promise<T>,
	enabled: MaybeRefOrGetter<boolean> = true,
	watchSource?: () => unknown,
) {
	const query = createQuery<T>(load);
	const snapshot = useSnapshot(query);
	let disposed = false;

	const refresh = () => {
		if (!disposed && toValue(enabled)) void query.refresh();
	};
	onMounted(refresh);
	watch(
		() => toValue(enabled),
		(on) => {
			if (on) refresh();
		},
	);
	if (watchSource) watch(watchSource, refresh, { deep: true });
	onScopeDispose(() => {
		disposed = true;
		query.dispose();
	});

	return {
		snapshot,
		data: computed(() => snapshot.value.data),
		loading: computed(() => snapshot.value.loading),
		error: computed(() => snapshot.value.error),
		reload: () => query.refresh(),
	};
}
