import { describe, expect, it } from "vitest";
import { type KitStringTable, resolveStrings } from "./index.ts";

interface TestStrings {
	send: string;
	stop: string;
}

const table: KitStringTable<TestStrings> = {
	"zh-CN": { send: "发送", stop: "停止" },
	en: { send: "Send", stop: "Stop" },
};

describe("resolveStrings", () => {
	it("按 locale 取词典，未知 locale 不影响（类型层收敛）", () => {
		expect(resolveStrings(table, "zh-CN")).toEqual(table["zh-CN"]);
		expect(resolveStrings(table, "en")).toEqual(table.en);
	});
	it("strings 覆盖只替换传入的键", () => {
		expect(resolveStrings(table, "en", { send: "Submit" })).toEqual({ send: "Submit", stop: "Stop" });
	});
	it("无覆盖时返回词典对象本身，不复制", () => {
		expect(resolveStrings(table, "zh-CN")).toBe(table["zh-CN"]);
	});
});
