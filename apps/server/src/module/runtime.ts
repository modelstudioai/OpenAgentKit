import { type DynamicModule, type FactoryProvider, Global, Module } from "@nestjs/common";
import type { KitRuntimeServices } from "../app-env.ts";
import type { ServerConfig } from "../config.ts";
import type { ProviderGateway } from "../gateway/types.ts";
import { AdminCatalogService } from "../service/admin/catalog/catalog.ts";
import { PresetPackService } from "../service/admin/catalog/preset-packs.ts";
import { TemplateDeletionService } from "../service/admin/catalog/template-deletion.ts";
import { TemplateListingService } from "../service/admin/catalog/template-listing.ts";
import { TemplateService } from "../service/admin/catalog/templates.ts";
import { DebugService } from "../service/admin/debug.ts";
import { EvalService } from "../service/admin/eval.ts";
import { GroupService } from "../service/admin/member/groups.ts";
import { MemberService } from "../service/admin/member/members.ts";
import { ProviderAdminService } from "../service/admin/provider-admin.ts";
import { ResourceDraftService } from "../service/admin/resource-draft/resource-drafts.ts";
import { TemplateUsageService } from "../service/admin/template-usage.ts";
import { AuditService } from "../service/shared/audit.ts";
import { BrandingService } from "../service/shared/branding.ts";
import { CatalogService } from "../service/shared/catalog.ts";
import { CatalogResourceService } from "../service/shared/catalog-resources.ts";
import { ConfirmGate } from "../service/shared/confirm-gate.ts";
import { MemberAuthService } from "../service/shared/member-auth.ts";
import { MemberDirectoryService } from "../service/shared/member-directory.ts";
import { MemberUsageService } from "../service/shared/member-usage.ts";
import { OidcAuthService } from "../service/shared/oidc-auth.ts";
import { OperationService } from "../service/shared/operations.ts";
import { FileService } from "../service/shared/session/files.ts";
import { SessionHistoryService } from "../service/shared/session/session-history.ts";
import { SessionIndexService } from "../service/shared/session/session-index.ts";
import { SessionRuntimeService } from "../service/shared/session/session-runtime.ts";
import { SessionService } from "../service/shared/session/sessions.ts";
import { TemplateCatalogService } from "../service/shared/templates.ts";
import { QuotaService } from "../service/shared/usage/quota.ts";
import { SessionUsageSnapshotService } from "../service/shared/usage/session-usage-snapshot.ts";
import { UsageAccountingService } from "../service/shared/usage/usage-accounting.ts";
import { UsageLimitService } from "../service/shared/usage/usage-limits.ts";
import { StaffCatalogService } from "../service/staff/catalog.ts";
import { KitSessionService } from "../service/staff/kit-sessions.ts";
import { StoreDatabase } from "../store/database.ts";
import {
	KIT_CONFIG,
	KIT_EVENT_BUFFERS,
	KIT_GATEWAY_MODE,
	KIT_METRICS,
	KIT_PROVIDER_GATEWAY,
	KIT_RATE_LIMITER,
	KIT_SERVICES,
} from "../utils/injection-tokens.ts";
import { createGateway } from "./gateways.ts";
import { connectDatabase, createInfrastructure, type Infrastructure } from "./infrastructure.ts";

const sharedServices = [
	AuditService,
	BrandingService,
	CatalogService,
	MemberDirectoryService,
	OperationService,
	SessionIndexService,
	SessionUsageSnapshotService,
	ConfirmGate,
];

@Global()
@Module({ providers: sharedServices, exports: sharedServices })
class InfrastructureModule {}

function infrastructureModule(core: Infrastructure): DynamicModule {
	const providers = [
		{ provide: StoreDatabase, useValue: core.database },
		{ provide: KIT_CONFIG, useValue: core.config },
		{ provide: KIT_EVENT_BUFFERS, useValue: core.buffers },
		{ provide: KIT_RATE_LIMITER, useValue: core.limiter },
		{ provide: KIT_METRICS, useValue: core.metrics },
		{ provide: KIT_PROVIDER_GATEWAY, inject: [KIT_CONFIG, SessionUsageSnapshotService], useFactory: createGateway },
		{
			provide: KIT_GATEWAY_MODE,
			inject: [KIT_PROVIDER_GATEWAY],
			useFactory: (gateway: ProviderGateway) => gateway.mode,
		},
	];
	return { module: InfrastructureModule, providers, exports: providers.map(({ provide }) => provide) };
}

@Module({
	providers: [MemberService, MemberAuthService, OidcAuthService, GroupService, MemberUsageService],
	exports: [MemberService, MemberAuthService, OidcAuthService, GroupService, MemberUsageService],
})
class MemberModule {}

@Module({
	providers: [
		AdminCatalogService,
		StaffCatalogService,
		CatalogResourceService,
		TemplateService,
		TemplateCatalogService,
		TemplateListingService,
		TemplateDeletionService,
		PresetPackService,
	],
	exports: [AdminCatalogService, StaffCatalogService, CatalogResourceService, TemplateService, PresetPackService],
})
class CatalogModule {}

@Module({
	imports: [MemberModule, CatalogModule],
	providers: [
		SessionHistoryService,
		SessionRuntimeService,
		FileService,
		UsageAccountingService,
		UsageLimitService,
		QuotaService,
		SessionService,
		KitSessionService,
	],
	exports: [FileService, UsageLimitService, QuotaService, SessionService, KitSessionService],
})
class SessionModule {}

@Module({ providers: [ResourceDraftService], exports: [ResourceDraftService] })
class ResourceDraftModule {}

@Module({
	imports: [SessionModule, MemberModule, CatalogModule],
	providers: [ProviderAdminService, DebugService, EvalService, TemplateUsageService],
	exports: [ProviderAdminService, DebugService, EvalService, TemplateUsageService],
})
class AdminModule {}

function runtimeServicesProvider(core: Infrastructure): FactoryProvider<KitRuntimeServices> {
	return {
		provide: KIT_SERVICES,
		inject: [
			ConfirmGate,
			OperationService,
			CatalogService,
			SessionIndexService,
			KIT_PROVIDER_GATEWAY,
			MemberService,
			MemberAuthService,
			OidcAuthService,
			GroupService,
			MemberUsageService,
			FileService,
			UsageLimitService,
			QuotaService,
			SessionService,
			TemplateService,
			PresetPackService,
			ResourceDraftService,
			DebugService,
			EvalService,
			AuditService,
			BrandingService,
			AdminCatalogService,
			StaffCatalogService,
			KitSessionService,
			ProviderAdminService,
			TemplateUsageService,
		],
		useFactory: (
			gate: ConfirmGate,
			operations: OperationService,
			catalog: CatalogService,
			sessionIndex: SessionIndexService,
			gateway: ProviderGateway,
			members: MemberService,
			memberAuth: MemberAuthService,
			oidcAuthService: OidcAuthService,
			groups: GroupService,
			memberUsage: MemberUsageService,
			files: FileService,
			usageLimits: UsageLimitService,
			quota: QuotaService,
			sessions: SessionService,
			templates: TemplateService,
			presetPacks: PresetPackService,
			resourceDrafts: ResourceDraftService,
			debug: DebugService,
			evaluation: EvalService,
			auditService: AuditService,
			brandingService: BrandingService,
			adminCatalog: AdminCatalogService,
			staffCatalog: StaffCatalogService,
			kitSessions: KitSessionService,
			providerAdmin: ProviderAdminService,
			templateUsage: TemplateUsageService,
		) => ({
			config: core.config,
			buffers: core.buffers,
			limiter: core.limiter,
			metrics: core.metrics,
			gateway,
			audit: auditService,
			branding: brandingService.records,
			catalog,
			sessionIndex,
			operations,
			gate,
			runner: operations,
			members,
			memberAuth,
			oidcAuthService,
			oidcAuth: core.config.oidc ? oidcAuthService : undefined,
			groups,
			memberUsage,
			files,
			usageLimits,
			quota,
			sessions,
			templates,
			presetPacks,
			resourceDrafts,
			debug,
			eval: evaluation,
			auditService,
			brandingService,
			adminCatalog,
			staffCatalog,
			kitSessions,
			providerAdmin,
			templateUsage,
		}),
	};
}

@Global()
@Module({
	imports: [MemberModule, SessionModule, CatalogModule, ResourceDraftModule, AdminModule],
	exports: [MemberModule, SessionModule, CatalogModule, ResourceDraftModule, AdminModule],
})
class KitRuntimeModule {}

export async function createManagedRuntime(config: ServerConfig) {
	if (config.authMode === "oidc" && !config.oidc) throw new Error("缺少 Keycloak OIDC 配置");
	const database = await connectDatabase(config);
	try {
		const core = createInfrastructure(config, database);
		const module: DynamicModule = {
			module: KitRuntimeModule,
			imports: [infrastructureModule(core)],
			providers: [runtimeServicesProvider(core)],
			exports: [KIT_SERVICES],
		};
		return { module, close: core.close };
	} catch (error) {
		await database.close().catch(() => undefined);
		throw error;
	}
}
