import { type MaybeRefOrGetter, onScopeDispose, type Ref, ref, toValue, watch } from "vue";

/**
 * 输入防抖：广场搜索每次按键都不该打一次 `/api/kit/plaza`（服务端要扫目录 + 统计）。
 * 只在值稳定 delayMs 之后更新，卸载/再次变化时清掉上一个定时器。
 */
export function useDebounced<T>(value: MaybeRefOrGetter<T>, delayMs: number): Ref<T> {
	const debounced = ref(toValue(value)) as Ref<T>;
	let timer: ReturnType<typeof setTimeout> | undefined;

	watch(
		() => toValue(value),
		(next) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				debounced.value = next;
			}, delayMs);
		},
	);
	onScopeDispose(() => {
		if (timer) clearTimeout(timer);
	});

	return debounced;
}
