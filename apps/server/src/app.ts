import type { INestApplication } from "@nestjs/common";
import type { ServerConfig } from "./config.ts";
import { createHttpApplication } from "./module/application.ts";
import { createManagedRuntime } from "./module/runtime.ts";

/** 初始化 Nest 应用，监听地址和进程信号由宿主负责。 */
export async function createApp(config: ServerConfig): Promise<INestApplication> {
	const runtime = await createManagedRuntime(config);
	return createHttpApplication(runtime.module, runtime.close);
}

export type { KitServices } from "./app-env.ts";
export type { ServerConfig } from "./config.ts";
