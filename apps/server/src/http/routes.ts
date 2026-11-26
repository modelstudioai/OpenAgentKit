import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import { createParamDecorator, type ExecutionContext, RequestMapping, RequestMethod, type Type } from "@nestjs/common";
import type { z } from "zod";
import { getRequest, type KitRequest } from "./request.ts";

const contractKey = Symbol("kit-http-contract");

export type RouteContract = Omit<RouteConfig, "method"> & { method: keyof typeof method; hide?: boolean };
export type InvalidInputHandler = (result: { success: false; error: z.ZodError }) => void;

export function defineRoute<const Route extends RouteContract>(route: Route): Route {
	return route;
}

const method = {
	get: RequestMethod.GET,
	post: RequestMethod.POST,
	put: RequestMethod.PUT,
	delete: RequestMethod.DELETE,
	patch: RequestMethod.PATCH,
	head: RequestMethod.HEAD,
	options: RequestMethod.OPTIONS,
};

export function KitRoute(route: RouteContract, invalid?: InvalidInputHandler): MethodDecorator {
	return (_target, _key, descriptor) => {
		const handler = descriptor.value;
		Reflect.defineMetadata(contractKey, { route, invalid }, handler as object);
		RequestMapping({ path: route.path.replaceAll(/\{([^}]+)\}/g, ":$1"), method: method[route.method] })(
			_target,
			_key,
			descriptor,
		);
	};
}

export function routeContract(handler: object): { route: RouteContract; invalid?: InvalidInputHandler } | undefined {
	return Reflect.getMetadata(contractKey, handler);
}

export function controllerContracts(controllers: readonly Type[]): RouteContract[] {
	return controllers.flatMap(({ prototype }) =>
		Object.getOwnPropertyNames(prototype).flatMap((name) => {
			const route = routeContract(prototype[name])?.route;
			return route && !route.hide ? [route] : [];
		}),
	);
}

export const KitInput = createParamDecorator(
	(_data: unknown, context: ExecutionContext): KitRequest => getRequest(context.switchToHttp().getRequest()),
);
