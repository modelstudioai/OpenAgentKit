import { describe, expect, it } from "vitest";
import { errorFromResponse, KitError } from "./errors.ts";

describe("KitError 文案键", () => {
	it("序列化并解析 message_key / message_params，message 仍保留兜底", async () => {
		const error = new KitError("invalid_request", "记忆库名称不能为空", {
			messageKey: "memory.nameRequired",
			messageParams: { field: "name" },
		});
		const body = error.toBody();
		expect(body.error).toMatchObject({
			message: "记忆库名称不能为空",
			message_key: "memory.nameRequired",
			message_params: { field: "name" },
		});

		const parsed = await errorFromResponse(
			new Response(JSON.stringify(body), { status: 400, headers: { "content-type": "application/json" } }),
		);
		expect(parsed).toBeInstanceOf(KitError);
		expect(parsed.message).toBe("记忆库名称不能为空");
		expect(parsed.messageKey).toBe("memory.nameRequired");
		expect(parsed.messageParams).toEqual({ field: "name" });
	});
});
