import type { ServerConfig } from "./config.ts";
import type { ProviderGateway } from "./gateway/types.ts";
import type { AdminCatalogService } from "./service/admin/catalog/catalog.ts";
import type { PresetPackService } from "./service/admin/catalog/preset-packs.ts";
import type { TemplateService } from "./service/admin/catalog/templates.ts";
import type { DebugService } from "./service/admin/debug.ts";
import type { EvalService } from "./service/admin/eval.ts";
import type { GroupService } from "./service/admin/member/groups.ts";
import type { MemberService } from "./service/admin/member/members.ts";
import type { ProviderAdminService } from "./service/admin/provider-admin.ts";
import type { ResourceDraftService } from "./service/admin/resource-draft/resource-drafts.ts";
import type { TemplateUsageService } from "./service/admin/template-usage.ts";
import type { AuditService } from "./service/shared/audit.ts";
import type { BrandingService } from "./service/shared/branding.ts";
import type { CatalogService } from "./service/shared/catalog.ts";
import type { ConfirmGate } from "./service/shared/confirm-gate.ts";
import type { MemberAuthService } from "./service/shared/member-auth.ts";
import type { MemberUsageService } from "./service/shared/member-usage.ts";
import type { OidcAuthService } from "./service/shared/oidc-auth.ts";
import type { OperationService } from "./service/shared/operations.ts";
import type { FileService } from "./service/shared/session/files.ts";
import type { SessionIndexService } from "./service/shared/session/session-index.ts";
import type { SessionService } from "./service/shared/session/sessions.ts";
import type { QuotaService } from "./service/shared/usage/quota.ts";
import type { UsageLimitService } from "./service/shared/usage/usage-limits.ts";
import type { StaffCatalogService } from "./service/staff/catalog.ts";
import type { KitSessionService } from "./service/staff/kit-sessions.ts";
import type { EventBufferRegistry } from "./utils/event-buffer.ts";
import type { Metrics } from "./utils/metrics.ts";
import type { RateLimiter } from "./utils/rate-limit.ts";

/** 可由宿主和测试替换的公开业务接口。 */
export interface KitServices {
	config: ServerConfig;
	branding: BrandingService["records"];
	gateway: ProviderGateway;
	buffers: EventBufferRegistry;
	catalog: Pick<
		CatalogService,
		| "list"
		| "listed"
		| "get"
		| "getBySlug"
		| "insert"
		| "update"
		| "all"
		| "create"
		| "upsert"
		| "updateBySlug"
		| "setStatus"
		| "remove"
	>;
	sessionIndex: Pick<
		SessionIndexService,
		| "listAgentsForSubject"
		| "pageForSubject"
		| "create"
		| "get"
		| "getForSubject"
		| "getDebugForSubject"
		| "owns"
		| "listForSubject"
		| "listDebugForSubject"
		| "remove"
		| "setTitle"
		| "appendFiles"
		| "appendMessageFiles"
		| "setStatus"
		| "setStatusUnlessArchived"
		| "touch"
		| "setStatusIfRunning"
	>;
	operations: Pick<OperationService, "create" | "get" | "owns" | "update" | "list" | "subscribe">;
	audit: Pick<AuditService, "append" | "list" | "page">;
	sessions: Pick<
		SessionService,
		| "create"
		| "send"
		| "interrupt"
		| "delete"
		| "archive"
		| "listAgents"
		| "listPage"
		| "list"
		| "events"
		| "threads"
		| "threadEvents"
		| "toolApprovals"
		| "respondToolApproval"
		| "download"
		| "upload"
		| "openStream"
	>;
	quota: Pick<
		QuotaService,
		| "stateFor"
		| "chargeTurn"
		| "plazaView"
		| "quotaView"
		| "createRequest"
		| "myRequests"
		| "policy"
		| "putPolicy"
		| "overrides"
		| "putOverride"
		| "deleteOverride"
		| "createPack"
		| "deletePack"
		| "requests"
		| "review"
		| "usage"
	>;
	usageLimits: Pick<
		UsageLimitService,
		| "policy"
		| "setPolicy"
		| "member"
		| "setMember"
		| "resetMember"
		| "template"
		| "templateDailyTrend"
		| "setTemplate"
		| "resetTemplate"
		| "isMember"
		| "runSend"
		| "runApproval"
	>;
	members: Pick<MemberService, "get" | "list" | "create">;
	groups: Pick<
		GroupService,
		| "get"
		| "summaries"
		| "list"
		| "groupMembers"
		| "memberGroups"
		| "create"
		| "update"
		| "updateGroupMembers"
		| "updateMemberGroups"
		| "planDelete"
		| "remove"
	>;
	templates: Pick<
		TemplateService,
		"get" | "versions" | "version" | "list" | "create" | "update" | "planDelete" | "remove" | "planListing" | "listing"
	>;
	presetPacks: Pick<PresetPackService, "get" | "list" | "preview" | "create">;
	memberUsage: Pick<
		MemberUsageService,
		| "refresh"
		| "summaryByTemplate"
		| "summary"
		| "list"
		| "listByTemplate"
		| "isMemberSession"
		| "hasFinalSnapshot"
		| "captureFinal"
		| "releaseFinal"
		| "markDeleted"
	>;
	memberAuth: Pick<MemberAuthService, "login" | "resolve" | "logout" | "bindStream">;
	oidcAuth?: Pick<OidcAuthService, "resolve" | "logout" | "bindStream" | "getBinding" | "bind" | "unbind">;
	files: Pick<FileService, "upload" | "requireUploads" | "status" | "download">;
	eval: Pick<EvalService, "workspaces" | "runs" | "run">;
	resourceDrafts: Pick<
		ResourceDraftService,
		"canReadOperation" | "active" | "get" | "create" | "discard" | "finalize" | "resourcesFor"
	>;
	debug: Pick<
		DebugService,
		| "requireSession"
		| "createTemplate"
		| "detail"
		| "send"
		| "interrupt"
		| "approvals"
		| "approve"
		| "planDelete"
		| "remove"
	>;
	runner: Pick<OperationService, "run">;
	gate: Pick<ConfirmGate, "issue" | "consume" | "pendingCount">;
	limiter: RateLimiter;
	metrics: Metrics;
}

/** Nest 装配和内部夹具持有实际的应用级单例。 */
export type KitRuntimeServices = KitServices & {
	catalog: CatalogService;
	sessionIndex: SessionIndexService;
	audit: AuditService;
	sessions: SessionService;
	quota: QuotaService;
	usageLimits: UsageLimitService;
	members: MemberService;
	groups: GroupService;
	templates: TemplateService;
	presetPacks: PresetPackService;
	memberUsage: MemberUsageService;
	memberAuth: MemberAuthService;
	files: FileService;
	eval: EvalService;
	resourceDrafts: ResourceDraftService;
	debug: DebugService;
	gate: ConfirmGate;
	oidcAuthService: OidcAuthService;
	auditService: AuditService;
	brandingService: BrandingService;
	adminCatalog: AdminCatalogService;
	staffCatalog: StaffCatalogService;
	kitSessions: KitSessionService;
	providerAdmin: ProviderAdminService;
	templateUsage: TemplateUsageService;
};
