import type { KitRuntimeServices } from "../../src/app-env.ts";
import type { ServerConfig } from "../../src/config.ts";
import { createGateway } from "../../src/module/gateways.ts";
import { createInfrastructure } from "../../src/module/infrastructure.ts";
import { AdminCatalogService } from "../../src/service/admin/catalog/catalog.ts";
import { PresetPackService } from "../../src/service/admin/catalog/preset-packs.ts";
import { TemplateDeletionService } from "../../src/service/admin/catalog/template-deletion.ts";
import { TemplateListingService } from "../../src/service/admin/catalog/template-listing.ts";
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
import { CatalogService } from "../../src/service/shared/catalog.ts";
import { CatalogResourceService } from "../../src/service/shared/catalog-resources.ts";
import { ConfirmGate } from "../../src/service/shared/confirm-gate.ts";
import { MemberAuthService } from "../../src/service/shared/member-auth.ts";
import { MemberDirectoryService } from "../../src/service/shared/member-directory.ts";
import { MemberUsageService } from "../../src/service/shared/member-usage.ts";
import { OidcAuthService } from "../../src/service/shared/oidc-auth.ts";
import { OperationService } from "../../src/service/shared/operations.ts";
import { FileService } from "../../src/service/shared/session/files.ts";
import { SessionHistoryService } from "../../src/service/shared/session/session-history.ts";
import { SessionIndexService } from "../../src/service/shared/session/session-index.ts";
import { SessionRuntimeService } from "../../src/service/shared/session/session-runtime.ts";
import { SessionService } from "../../src/service/shared/session/sessions.ts";
import { StartupService } from "../../src/service/shared/startup.ts";
import { TemplateCatalogService } from "../../src/service/shared/templates.ts";
import { QuotaService } from "../../src/service/shared/usage/quota.ts";
import { SessionUsageSnapshotService } from "../../src/service/shared/usage/session-usage-snapshot.ts";
import { UsageAccountingService } from "../../src/service/shared/usage/usage-accounting.ts";
import { UsageLimitService } from "../../src/service/shared/usage/usage-limits.ts";
import { StaffCatalogService } from "../../src/service/staff/catalog.ts";
import { KitSessionService } from "../../src/service/staff/kit-sessions.ts";
import type { DatabaseConnection } from "../../src/store/connect.ts";
import type { StoreDatabase } from "../../src/store/database.ts";
import { createSqliteDatabase } from "../../src/store/sqlite.ts";

/** 同步构造测试夹具，首次业务操作前执行与生产相同的启动事务。 */
function fixtureDatabase(connection: DatabaseConnection, defaultMonthly: number | undefined): StoreDatabase {
	if (!("prepare" in connection)) return connection;
	const store = createSqliteDatabase(connection);
	let startup: Promise<void> | undefined;
	const ready = () => (startup ??= new StartupService(store).initialize(defaultMonthly));
	return {
		...store,
		read: async (work) => {
			await ready();
			return store.read(work);
		},
		write: async (work) => {
			await ready();
			return store.write(work);
		},
		transaction: async (work) => {
			await ready();
			return store.transaction(work);
		},
		insertEntityIfAbsent: async (entity, values, keys) => {
			await ready();
			return store.insertEntityIfAbsent(entity, values, keys);
		},
	};
}

export function createKitServices(
	config: ServerConfig,
	connection: DatabaseConnection,
): KitRuntimeServices & { close(): Promise<void> } {
	const database = fixtureDatabase(connection, config.quotaDefaultMonthly);
	const core = createInfrastructure(config, database);
	const { buffers, limiter, metrics } = core;
	const usageSnapshots = new SessionUsageSnapshotService(database);
	const gateway = createGateway(config, usageSnapshots);
	const audit = new AuditService(database);
	const branding = new BrandingService(database, audit);
	const catalog = new CatalogService(database);
	const memberDirectory = new MemberDirectoryService(database);
	const oidcAuthService = new OidcAuthService(config, database, memberDirectory, audit);
	const sessionIndex = new SessionIndexService(database);
	const operations = new OperationService(database);
	const templateCatalog = new TemplateCatalogService(database);
	const gate = new ConfirmGate(config);
	const resources = new CatalogResourceService(gateway);
	const history = new SessionHistoryService(gateway);
	const runtime = new SessionRuntimeService();
	const memberUsage = new MemberUsageService(usageSnapshots, memberDirectory, gateway, sessionIndex, database);
	const usageLimits = new UsageLimitService(
		new UsageAccountingService(database),
		memberDirectory,
		sessionIndex,
		usageSnapshots,
		gateway,
		history,
		audit,
		buffers,
		config,
		database,
		runtime,
	);
	const sessions = new SessionService(
		gateway,
		history,
		buffers,
		sessionIndex,
		config,
		metrics,
		memberUsage,
		usageLimits,
		database,
		runtime,
	);
	const files = new FileService(gateway, history, sessionIndex, database, audit, metrics);
	const adminCatalog = new AdminCatalogService(catalog, resources, audit, gate);
	const staffCatalog = new StaffCatalogService(catalog, gateway);
	const quota = new QuotaService(database, catalog, sessionIndex, audit, usageLimits);
	const groups = new GroupService(database, audit, gate);
	const listing = new TemplateListingService(templateCatalog, gateway, resources, audit, catalog, gate, database);
	const deletion = new TemplateDeletionService(templateCatalog, audit, catalog, gate, database);
	const templates = new TemplateService(
		templateCatalog,
		gateway,
		resources,
		audit,
		catalog,
		listing,
		deletion,
		database,
	);
	return {
		config,
		buffers,
		limiter,
		metrics,
		gateway,
		audit,
		branding: branding.records,
		catalog,
		sessionIndex,
		operations,
		async close() {
			try {
				await sessions.closeStreams();
			} finally {
				await core.close();
			}
		},
		gate,
		runner: operations,
		memberUsage,
		usageLimits,
		sessions,
		files,
		auditService: audit,
		brandingService: branding,
		adminCatalog,
		staffCatalog,
		kitSessions: new KitSessionService(
			audit,
			staffCatalog,
			files,
			gate,
			gateway,
			quota,
			sessionIndex,
			sessions,
			usageLimits,
			resources,
		),
		providerAdmin: new ProviderAdminService(gateway, config),
		memberAuth: new MemberAuthService(memberDirectory, database, audit),
		oidcAuthService,
		oidcAuth: config.oidc ? oidcAuthService : undefined,
		members: new MemberService(memberDirectory, audit, groups, memberUsage, database, config, oidcAuthService),
		groups,
		templates,
		templateUsage: new TemplateUsageService(templates, memberUsage, usageLimits),
		presetPacks: new PresetPackService(database, gateway, resources),
		eval: new EvalService(config),
		quota,
		resourceDrafts: new ResourceDraftService(config, gateway, database, gate, operations, audit),
		debug: new DebugService(sessions, sessionIndex, gateway, resources, gate, audit),
	};
}
