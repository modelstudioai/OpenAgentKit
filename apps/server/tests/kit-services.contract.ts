import type { KitServices } from "../src/app.ts";

type PublicMethods<T> = Pick<T, keyof T>;
type ServiceDoubles = { [K in keyof KitServices]: PublicMethods<NonNullable<KitServices[K]>> };
type AcceptedServices<T extends KitServices> = T;

/** 包调用方可用普通对象替换服务，包括仅实现四个附件操作的旧夹具。 */
export type StructuralServiceContract = AcceptedServices<
	Omit<ServiceDoubles, "files"> & {
		files: Pick<KitServices["files"], "upload" | "requireUploads" | "status" | "download">;
	}
>;
