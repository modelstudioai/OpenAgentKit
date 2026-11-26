import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import type { Type } from "@nestjs/common";
import type { OpenAPIObject } from "@nestjs/swagger";
import { PROTOCOL_VERSION } from "@openagentkit/sdk/protocol";
import { controllerContracts } from "./routes.ts";

export function generateOpenApi(controllers: readonly Type[]): OpenAPIObject {
	const registry = new OpenAPIRegistry();
	for (const { hide: _hide, ...route } of controllerContracts(controllers)) registry.registerPath(route);

	// 保持原有 Zod 文档转换方式和 SDK 类型语义。
	return new OpenApiGeneratorV3(registry.definitions).generateDocument({
		openapi: "3.1.0",
		info: { title: "OpenAgentKit Server", version: PROTOCOL_VERSION },
		tags: [
			{ name: "meta", description: "探针与运行时公开配置（不需要身份）" },
			{ name: "kit", description: "数据面：终端用户的目录、会话、消息、流与文件" },
			{ name: "admin", description: "控制面：上架目录、审计与指标（ADMIN_TOKEN）" },
			{ name: "admin-debug", description: "控制面：已发布 Agent 的管理员调试会话与文件" },
		],
	}) as OpenAPIObject;
}
