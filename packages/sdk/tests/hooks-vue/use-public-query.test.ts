// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";
import { usePublicQuery } from "../../src/hooks-vue/shared.ts";

function mountHarness(loader: (signal: AbortSignal) => Promise<number>, enabled: Ref<boolean>) {
	const Harness = defineComponent({
		setup() {
			const query = usePublicQuery(loader, () => enabled.value);
			return { query };
		},
		render: () => null,
	});
	return mount(Harness);
}

describe("usePublicQuery（Vue）", () => {
	it("挂载后按 enabled 拉取并暴露数据", async () => {
		const enabled = ref(true);
		let calls = 0;
		const wrapper = mountHarness(async () => {
			calls += 1;
			return 42;
		}, enabled);
		await flushPromises();
		expect(calls).toBe(1);
		expect(wrapper.vm.query.data.value).toBe(42);
		wrapper.unmount();
	});

	it("enabled 关闭时不拉取，打开后补拉取", async () => {
		const enabled = ref(false);
		let calls = 0;
		const wrapper = mountHarness(async () => {
			calls += 1;
			return 1;
		}, enabled);
		await flushPromises();
		expect(calls).toBe(0);
		enabled.value = true;
		await nextTick();
		await flushPromises();
		expect(calls).toBe(1);
		wrapper.unmount();
	});

	it("卸载时中止进行中的请求", async () => {
		const enabled = ref(true);
		const aborted: boolean[] = [];
		const wrapper = mountHarness(
			(signal) =>
				new Promise<number>((resolve) => {
					signal.addEventListener(
						"abort",
						() => {
							aborted.push(true);
							resolve(0);
						},
						{ once: true },
					);
				}),
			enabled,
		);
		await nextTick();
		wrapper.unmount();
		await Promise.resolve();
		expect(aborted).toEqual([true]);
	});
});
