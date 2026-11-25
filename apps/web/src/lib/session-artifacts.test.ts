import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ARTIFACT_POLL_INTERVAL_MS, createArtifactPoller } from "./session-artifacts.ts";

describe("会话产物补取器", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useFakeTimers());

	it("执行期间按间隔补取，停止后不再触发", () => {
		const refresh = vi.fn();
		const poller = createArtifactPoller(refresh, 1000);
		poller.start();
		expect(poller.running).toBe(true);
		vi.advanceTimersByTime(2500);
		expect(refresh).toHaveBeenCalledTimes(2);
		poller.stop();
		expect(poller.running).toBe(false);
		vi.advanceTimersByTime(5000);
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it("重复启动不叠加定时器，未启动时停止安全", () => {
		const refresh = vi.fn();
		const poller = createArtifactPoller(refresh, 1000);
		poller.stop();
		poller.start();
		poller.start();
		poller.start();
		vi.advanceTimersByTime(1000);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("缺省间隔与侧栏运行态轮询同量级", () => {
		const refresh = vi.fn();
		const poller = createArtifactPoller(refresh);
		poller.start();
		vi.advanceTimersByTime(ARTIFACT_POLL_INTERVAL_MS - 1);
		expect(refresh).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
