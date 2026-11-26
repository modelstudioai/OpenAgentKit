import type { Server } from "node:http";
import { Global, type INestApplication, Module } from "@nestjs/common";
import { afterEach } from "vitest";
import type { KitRuntimeServices } from "../../src/app-env.ts";
import { createHttpApplication } from "../../src/module/application.ts";
import { AdminCatalogService } from "../../src/service/admin/catalog/catalog.ts";
import { PresetPackService } from "../../src/service/admin/catalog/preset-packs.ts";
import { TemplateService } from "../../src/service/admin/catalog/templates.ts";
import { DebugService } from "../../src/service/admin/debug.ts";
import { EvalService } from "../../src/service/admin/eval.ts";
import { GroupService } from "../../src/service/admin/member/groups.ts";
import { MemberService } from "../../src/service/admin/member/members.ts";
import { ProviderAdminService } from "../../src/service/admin/provider-admin.ts";
import { ResourceDraftService } from "../../src/service/admin/resource-draft/resource-drafts.ts";
import { TemplateUsageService } from "../../src/service/admin/template-usage.ts";
import { AuditService } from "../../src/service/shared/audit.ts";
import { BrandingService } from "../../src/service/shared/branding.ts";
import { MemberAuthService } from "../../src/service/shared/member-auth.ts";
import { MemberUsageService } from "../../src/service/shared/member-usage.ts";
import { OidcAuthService } from "../../src/service/shared/oidc-auth.ts";
import { FileService } from "../../src/service/shared/session/files.ts";
import { SessionService } from "../../src/service/shared/session/sessions.ts";
import { QuotaService } from "../../src/service/shared/usage/quota.ts";
import { UsageLimitService } from "../../src/service/shared/usage/usage-limits.ts";
import { StaffCatalogService } from "../../src/service/staff/catalog.ts";
import { KitSessionService } from "../../src/service/staff/kit-sessions.ts";
import {
	KIT_CONFIG,
	KIT_EVENT_BUFFERS,
	KIT_GATEWAY_MODE,
	KIT_METRICS,
	KIT_RATE_LIMITER,
} from "../../src/utils/injection-tokens.ts";

const running = new Set<Promise<{ app: INestApplication; origin: string }>>();

async function listen(services: KitRuntimeServices) {
	@Global()
	@Module({})
	class FixtureModule {}
	const providers = [
		[AuditService, services.auditService],
		[BrandingService, services.brandingService],
		[AdminCatalogService, services.adminCatalog],
		[StaffCatalogService, services.staffCatalog],
		[DebugService, services.debug],
		[EvalService, services.eval],
		[FileService, services.files],
		[GroupService, services.groups],
		[KitSessionService, services.kitSessions],
		[MemberAuthService, services.memberAuth],
		[OidcAuthService, services.oidcAuthService],
		[MemberUsageService, services.memberUsage],
		[MemberService, services.members],
		[PresetPackService, services.presetPacks],
		[ProviderAdminService, services.providerAdmin],
		[QuotaService, services.quota],
		[ResourceDraftService, services.resourceDrafts],
		[SessionService, services.sessions],
		[TemplateUsageService, services.templateUsage],
		[TemplateService, services.templates],
		[UsageLimitService, services.usageLimits],
		[KIT_CONFIG, services.config],
		[KIT_GATEWAY_MODE, services.gateway.mode],
		[KIT_EVENT_BUFFERS, services.buffers],
		[KIT_METRICS, services.metrics],
		[KIT_RATE_LIMITER, services.limiter],
	] as const;
	const app = await createHttpApplication({
		module: FixtureModule,
		providers: providers.map(([provide, useValue]) => ({ provide, useValue })),
		exports: providers.map(([provide]) => provide),
	});
	try {
		await app.listen(0, "127.0.0.1");
		const address = (app.getHttpServer() as Server).address();
		if (!address || typeof address === "string") throw new Error("测试 Server 未绑定回环端口");
		return { app, origin: `http://127.0.0.1:${address.port}` };
	} catch (error) {
		await app.close();
		throw error;
	}
}

afterEach(async () => {
	const pending = [...running];
	running.clear();
	const results = await Promise.allSettled(pending);
	await Promise.all(results.flatMap((item) => (item.status === "fulfilled" ? [item.value.app.close()] : [])));
});

/** 夹具先注入服务，再在首次请求时启动真实 Nest HTTP 监听。 */
export function createTestApp(services: KitRuntimeServices) {
	let instance: Promise<{ app: INestApplication; origin: string }> | undefined;
	return {
		async request(input: string | URL | Request, init?: RequestInit) {
			if (!instance) {
				instance = listen(services);
				running.add(instance);
			}
			const { origin } = await instance;
			if (input instanceof Request) {
				const source = new URL(input.url);
				return fetch(new Request(new URL(source.pathname + source.search, origin), input), init);
			}
			return fetch(new URL(input, origin), init);
		},
	};
}
