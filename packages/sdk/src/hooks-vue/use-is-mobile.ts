import { computed, onMounted, onScopeDispose, ref } from "vue";

export function useIsMobile(breakpointPx = 768) {
	const isMobile = ref(typeof window === "undefined" ? false : window.innerWidth < breakpointPx);
	let query: MediaQueryList | null = null;
	const onChange = () => {
		if (query) isMobile.value = query.matches;
	};
	onMounted(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		query = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
		onChange();
		query.addEventListener("change", onChange);
	});
	onScopeDispose(() => {
		query?.removeEventListener("change", onChange);
	});
	return computed(() => isMobile.value);
}
