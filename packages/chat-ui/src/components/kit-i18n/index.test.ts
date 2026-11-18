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

describe("format", () => {
	it("替换模板中的 {{name}} 占位，缺失值替换为空串", async () => {
		const { format } = await import("./index.ts");
		expect(format("已用 {{value}} / {{max}}", { value: 3, max: 10 })).toBe("已用 3 / 10");
		expect(format("缺失 {{miss}}", {})).toBe("缺失 ");
	});
});
