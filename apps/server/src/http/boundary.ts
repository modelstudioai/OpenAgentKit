import type { ServerResponse } from "node:http";
import {
	type ArgumentsHost,
	type CallHandler,
	Catch,
	type ExceptionFilter,
	type ExecutionContext,
	HttpException,
	type INestApplication,
	type NestInterceptor,
} from "@nestjs/common";
import {
	isProtocolCompatible,
	KitError,
	PROTOCOL_VERSION_HEADER,
	RESOURCE_DRAFT_KEY_HEADER,
} from "@openagentkit/sdk/protocol";
import { mergeMap } from "rxjs";
import { redactSecrets, type ServerConfig } from "../config.ts";
import type { ResourceDraftService } from "../service/admin/resource-draft/resource-drafts.ts";
import type { MemberAuthService } from "../service/shared/member-auth.ts";
import type { OidcAuthService } from "../service/shared/oidc-auth.ts";
import type { Metrics } from "../utils/metrics.ts";
import type { RateLimiter } from "../utils/rate-limit.ts";
import { createOriginMatcher, DEFAULT_CORS_ORIGINS, type OriginMatcher } from "./cors.ts";
import { bindDraftResources, filterDraftResponse } from "./draft-boundary.ts";
import { resolveAdminIdentity, resolveIdentity } from "./identity.ts";
import { getRequest, type HttpRequest, KitRequest } from "./request.ts";
import { routeContract } from "./routes.ts";
import { InvalidInput, validateRequest } from "./validation.ts";

const publicPaths = new Set([
	"/healthz",
	"/api/config",
	"/api/branding/logo",
	"/openapi.json",
	"/docs",
	"/api/kit/auth/login",
	"/api/kit/auth/logout",
]);
const readOnlyMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const uploadPaths = new Set(["/api/kit/files", "/api/admin/debug/files", "/api/admin/branding/logo"]);
const draftUpload = /^\/api\/admin\/resource-drafts\/[^/]+\/resources\/(?:file|skill)-uploads$/;
const noStore =
	/^\/api\/(?:kit\/(?:auth\/|usage-limits$)|admin\/(?:groups(?:\/|$)|members(?:\/|$)|templates(?:\/|$)|preset-packs(?:\/|$)|usage-limits\/))/;

interface HttpBoundaryDependencies {
	config: ServerConfig;
	memberAuth: MemberAuthService;
	oidcAuth: OidcAuthService;
	resourceDrafts: ResourceDraftService;
	metrics: Metrics;
	limiter: RateLimiter;
}

function cors(request: KitRequest, matchOrigin: OriginMatcher) {
	const allowed = matchOrigin(request.header("origin") ?? "");
	if (allowed) request.setHeader("Access-Control-Allow-Origin", allowed);
	request.setHeader("Vary", request.method === "OPTIONS" ? "Origin, Access-Control-Request-Headers" : "Origin");
	request.setHeader("Access-Control-Allow-Credentials", "true");
	request.setHeader("Access-Control-Expose-Headers", "Content-Disposition,Retry-After");
	if (request.method !== "OPTIONS") return false;
	request.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,POST,DELETE,PATCH,QUERY");
	request.setHeader(
		"Access-Control-Allow-Headers",
		`content-type,authorization,${PROTOCOL_VERSION_HEADER},${RESOURCE_DRAFT_KEY_HEADER}`,
	);
	return true;
}

async function authenticate(request: KitRequest, services: HttpBoundaryDependencies, response: ServerResponse) {
	if (noStore.test(request.path)) request.setHeader("Cache-Control", "no-store");
	if (publicPaths.has(request.path)) return;
	if (!request.path.startsWith("/api/admin")) {
		request.identity = await resolveIdentity(request, services.config, services.memberAuth, services.oidcAuth);
		return;
	}
	const admin = resolveAdminIdentity(request, services.config);
	const readOnly = readOnlyMethods.has(request.method);
	if (!readOnly && admin.role !== "admin") {
		services.metrics.count("kit_admin_writes_total", { role: admin.role, status: 403 });
		throw new KitError("forbidden", "auditor 是只读角色，不能执行写操作");
	}
	request.admin = admin;
	request.identity = { subjectId: admin.subject, tier: admin.role };
	if (!readOnly) {
		response.once("finish", () => {
			services.metrics.count("kit_admin_writes_total", { role: admin.role, status: response.statusCode });
		});
	}
}

async function enforcePolicy(request: KitRequest, services: HttpBoundaryDependencies) {
	if (!request.path.startsWith("/api/")) return;
	if (
		(request.path.startsWith("/api/kit/sessions/") || request.path.startsWith("/api/admin/debug/sessions/")) &&
		/\/(stream|messages|tool-approvals)$/.test(request.path) &&
		!isProtocolCompatible(request.header(PROTOCOL_VERSION_HEADER) ?? "")
	) {
		throw new KitError("conflict", "Kit 协议版本不兼容，请刷新或升级客户端");
	}
	const { config, limiter, metrics } = services;
	const upload = uploadPaths.has(request.path) || draftUpload.test(request.path);
	await request.readBody(upload ? config.uploadMaxBytes + 4096 : config.bodyLimitBytes);
	const subject = request.subjectId;
	if (!subject) return;
	const verdict = limiter.take(subject);
	if (verdict.ok) return;
	metrics.count("kit_rate_limited_total", { route: "/api/*" });
	request.setHeader("Retry-After", String(verdict.retryAfterSeconds));
	throw new KitError("rate_limited", `请求过于频繁，请 ${verdict.retryAfterSeconds}s 后重试`, { retryable: true });
}

function recordRequest(request: KitRequest, response: ServerResponse, services: HttpBoundaryDependencies) {
	response.once("finish", () => {
		const route = request.raw.route?.path ?? (request.path === "/openapi.json" ? request.path : "*");
		const status = response.statusCode;
		services.metrics.count("kit_http_requests_total", { route, method: request.method, status });
		if (status >= 400) services.metrics.count("kit_http_request_errors_total", { route, status });
	});
}

function sendError(error: unknown, response: ServerResponse) {
	if (response.headersSent) {
		response.end();
		return;
	}
	let failure: KitError;
	if (error instanceof InvalidInput) {
		response.writeHead(400, { "content-type": "application/json" });
		response.end(JSON.stringify({ success: false, error: error.error }));
		return;
	}
	if (error instanceof KitError) failure = error;
	else if (error instanceof HttpException && error.getStatus() === 404) {
		failure = new KitError("not_found", "路由不存在");
	} else {
		console.error("[kit-server]", redactSecrets(error instanceof Error ? error.message : String(error)));
		failure = new KitError("internal", "服务端内部错误");
	}
	const body = failure.toBody();
	body.error.message = redactSecrets(body.error.message);
	response.writeHead(failure.status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

@Catch()
class KitExceptionFilter implements ExceptionFilter {
	catch(error: unknown, host: ArgumentsHost) {
		sendError(error, host.switchToHttp().getResponse());
	}
}

class KitContractInterceptor implements NestInterceptor {
	async intercept(context: ExecutionContext, next: CallHandler) {
		const contract = routeContract(context.getHandler());
		if (!contract) return next.handle();
		const request = getRequest(context.switchToHttp().getRequest());
		await validateRequest(request, contract.route, contract.invalid);
		return next.handle().pipe(mergeMap((response: Response) => filterDraftResponse(request, response)));
	}
}

export function installHttpBoundary(app: INestApplication, services: HttpBoundaryDependencies, shutdown: AbortSignal) {
	const matchOrigin = createOriginMatcher(
		services.config.corsOrigins.length ? services.config.corsOrigins : DEFAULT_CORS_ORIGINS,
	);
	app.useGlobalFilters(new KitExceptionFilter());
	app.useGlobalInterceptors(new KitContractInterceptor());
	app.use(async (raw: HttpRequest, response: ServerResponse, next: () => void) => {
		const request = new KitRequest(raw, response, shutdown);
		try {
			if (cors(request, matchOrigin)) {
				response.writeHead(204).end();
				return;
			}
			await authenticate(request, services, response);
			await enforcePolicy(request, services);
			recordRequest(request, response, services);
			const published = await bindDraftResources(request, services.resourceDrafts);
			if (published) {
				response.writeHead(published.status, Object.fromEntries(published.headers));
				response.end(await published.text());
				return;
			}
			next();
		} catch (error) {
			sendError(error, response);
		}
	});
}
