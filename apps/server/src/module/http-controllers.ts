import { Module } from "@nestjs/common";
import { AdminAgentVersionsController } from "../controller/admin/admin-agent-versions.ts";
import { AdminAuditController } from "../controller/admin/admin-audit.ts";
import { AdminBrandingController } from "../controller/admin/admin-branding.ts";
import { AdminCatalogController } from "../controller/admin/admin-catalog.ts";
import { AdminDebugController, AdminDebugFilesController } from "../controller/admin/admin-debug.ts";
import { AdminDebugSessionThreadsController } from "../controller/admin/admin-debug-session-threads.ts";
import { AdminDraftAgentsController } from "../controller/admin/admin-draft-agents.ts";
import { AdminDraftEnvironmentsController } from "../controller/admin/admin-draft-environments.ts";
import { AdminDraftFileUploadsController } from "../controller/admin/admin-draft-file-uploads.ts";
import { AdminDraftMemoryStoresController } from "../controller/admin/admin-draft-memory-stores.ts";
import { AdminDraftResourceBindingsController } from "../controller/admin/admin-draft-resource-bindings.ts";
import { AdminDraftResourcesController } from "../controller/admin/admin-draft-resources.ts";
import { AdminDraftSkillUploadsController } from "../controller/admin/admin-draft-skill-uploads.ts";
import { AdminDraftVaultsController } from "../controller/admin/admin-draft-vaults.ts";
import { AdminEnvironmentsController } from "../controller/admin/admin-environments.ts";
import { AdminEvalController } from "../controller/admin/admin-eval.ts";
import { AdminFilesController } from "../controller/admin/admin-files.ts";
import { AdminGroupsController } from "../controller/admin/admin-groups.ts";
import { AdminMemberOidcBindingsController } from "../controller/admin/admin-member-oidc-bindings.ts";
import { AdminMembersController, AdminMemberUsageController } from "../controller/admin/admin-members.ts";
import { AdminMemoryStoresController } from "../controller/admin/admin-memory-stores.ts";
import { AdminMetricsController } from "../controller/admin/admin-metrics.ts";
import { AdminOperationsController } from "../controller/admin/admin-operations.ts";
import { AdminPresetPacksController } from "../controller/admin/admin-preset-packs.ts";
import { AdminProviderController } from "../controller/admin/admin-provider.ts";
import { AdminQuotaController } from "../controller/admin/admin-quota.ts";
import { AdminRemoteSkillsController } from "../controller/admin/admin-remote-skills.ts";
import { AdminResourceDraftsController } from "../controller/admin/admin-resource-drafts.ts";
import { AdminTemplateVersionsController } from "../controller/admin/admin-template-versions.ts";
import { AdminTemplatesController } from "../controller/admin/admin-templates.ts";
import { AdminProviderUsageController, AdminUsageController } from "../controller/admin/admin-usage.ts";
import { AdminUsageLimitsController } from "../controller/admin/admin-usage-limits.ts";
import { AdminVaultsController } from "../controller/admin/admin-vaults.ts";
import { MetaController } from "../controller/meta.ts";
import { MemberAuthController } from "../controller/staff/member-auth.ts";
import { SessionDirectoryController } from "../controller/staff/session-directory.ts";
import { SessionThreadsController } from "../controller/staff/session-threads.ts";
import { StaffCatalogController } from "../controller/staff/staff-catalog.ts";
import { StaffFilesController } from "../controller/staff/staff-files.ts";
import { StaffQuotaController } from "../controller/staff/staff-quota.ts";
import { StaffSessionsController } from "../controller/staff/staff-sessions.ts";
import { ToolApprovalsController } from "../controller/staff/tool-approvals.ts";
import { StaffUsageLimitsController } from "../controller/staff/usage-limits.ts";

const staffControllers = [
	MemberAuthController,
	SessionDirectoryController,
	SessionThreadsController,
	ToolApprovalsController,
	StaffSessionsController,
	StaffFilesController,
	StaffQuotaController,
	StaffUsageLimitsController,
	StaffCatalogController,
];

const adminControllers = [
	AdminMemberOidcBindingsController,
	AdminMembersController,
	AdminMemberUsageController,
	AdminGroupsController,
	AdminUsageLimitsController,
	AdminBrandingController,
	AdminPresetPacksController,
	AdminTemplateVersionsController,
	AdminTemplatesController,
	AdminResourceDraftsController,
	AdminDraftAgentsController,
	AdminDraftEnvironmentsController,
	AdminDraftVaultsController,
	AdminDraftMemoryStoresController,
	AdminDraftResourceBindingsController,
	AdminDraftFileUploadsController,
	AdminDraftSkillUploadsController,
	AdminDraftResourcesController,
	AdminAgentVersionsController,
	AdminAuditController,
	AdminEnvironmentsController,
	AdminRemoteSkillsController,
	AdminFilesController,
	AdminMemoryStoresController,
	AdminVaultsController,
	AdminCatalogController,
	AdminProviderController,
	AdminOperationsController,
	AdminMetricsController,
	AdminEvalController,
	AdminQuotaController,
	AdminUsageController,
	AdminProviderUsageController,
	AdminDebugController,
	AdminDebugFilesController,
	AdminDebugSessionThreadsController,
];

@Module({ controllers: staffControllers })
class StaffHttpModule {}

@Module({ controllers: adminControllers })
class AdminHttpModule {}

export const publicControllers = [MetaController];
export const routeControllers = [...publicControllers, ...staffControllers, ...adminControllers];
export const httpModules = [StaffHttpModule, AdminHttpModule];
