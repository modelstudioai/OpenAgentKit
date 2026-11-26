import { CatalogAgentsEntity } from "./catalog-agents.entity.ts";
import { KitAuditEntity } from "./kit-audit.entity.ts";
import { KitBrandingEntity } from "./kit-branding.entity.ts";
import { KitBrandingLogoEntity } from "./kit-branding-logo.entity.ts";
import { KitGroupMembersEntity } from "./kit-group-members.entity.ts";
import { KitGroupsEntity } from "./kit-groups.entity.ts";
import { KitMemberSessionsEntity } from "./kit-member-sessions.entity.ts";
import { KitMembersEntity } from "./kit-members.entity.ts";
import { KitOidcMemberBindingsEntity } from "./kit-oidc-member-bindings.entity.ts";
import { KitOidcTokenRevocationsEntity } from "./kit-oidc-token-revocations.entity.ts";
import { KitOperationsEntity } from "./kit-operations.entity.ts";
import { KitPresetPacksEntity } from "./kit-preset-packs.entity.ts";
import { KitResourceDraftDocumentsEntity } from "./kit-resource-draft-documents.entity.ts";
import { KitResourceDraftsEntity } from "./kit-resource-drafts.entity.ts";
import { KitRetiredDirectoryDraftsEntity } from "./kit-retired-directory-drafts.entity.ts";
import { KitSessionDeletionsEntity } from "./kit-session-deletions.entity.ts";
import { KitSessionUsageEntity } from "./kit-session-usage.entity.ts";
import { KitSessionsEntity } from "./kit-sessions.entity.ts";
import { KitTemplateListingsEntity } from "./kit-template-listings.entity.ts";
import { KitTemplateVersionsEntity } from "./kit-template-versions.entity.ts";
import { KitTemplatesEntity } from "./kit-templates.entity.ts";
import { KitUploadedFilesEntity } from "./kit-uploaded-files.entity.ts";
import { KitUsageLimitAgentDaysEntity } from "./kit-usage-limit-agent-days.entity.ts";
import { KitUsageLimitAgentMonthsEntity } from "./kit-usage-limit-agent-months.entity.ts";
import { KitUsageLimitDaysEntity } from "./kit-usage-limit-days.entity.ts";
import { KitUsageLimitMembersEntity } from "./kit-usage-limit-members.entity.ts";
import { KitUsageLimitMonthsEntity } from "./kit-usage-limit-months.entity.ts";
import { KitUsageLimitOverridesEntity } from "./kit-usage-limit-overrides.entity.ts";
import { KitUsageLimitPolicyEntity } from "./kit-usage-limit-policy.entity.ts";
import { KitUsageLimitRequestsEntity } from "./kit-usage-limit-requests.entity.ts";
import { KitUsageLimitSessionsEntity } from "./kit-usage-limit-sessions.entity.ts";
import { KitUsageLimitTemplatesEntity } from "./kit-usage-limit-templates.entity.ts";
import { QuotaOverrideEntity } from "./quota-override.entity.ts";
import { QuotaPackEntity } from "./quota-pack.entity.ts";
import { QuotaPolicyEntity } from "./quota-policy.entity.ts";
import { QuotaRequestEntity } from "./quota-request.entity.ts";
import { UsageTurnsEntity } from "./usage-turns.entity.ts";

export const entityClasses = {
	catalog_agents: CatalogAgentsEntity,
	kit_audit: KitAuditEntity,
	kit_branding: KitBrandingEntity,
	kit_branding_logo: KitBrandingLogoEntity,
	kit_group_members: KitGroupMembersEntity,
	kit_groups: KitGroupsEntity,
	kit_member_sessions: KitMemberSessionsEntity,
	kit_members: KitMembersEntity,
	kit_oidc_member_bindings: KitOidcMemberBindingsEntity,
	kit_oidc_token_revocations: KitOidcTokenRevocationsEntity,
	kit_operations: KitOperationsEntity,
	kit_preset_packs: KitPresetPacksEntity,
	kit_resource_draft_documents: KitResourceDraftDocumentsEntity,
	kit_resource_drafts: KitResourceDraftsEntity,
	kit_retired_directory_drafts: KitRetiredDirectoryDraftsEntity,
	kit_session_deletions: KitSessionDeletionsEntity,
	kit_session_usage: KitSessionUsageEntity,
	kit_sessions: KitSessionsEntity,
	kit_template_listings: KitTemplateListingsEntity,
	kit_template_versions: KitTemplateVersionsEntity,
	kit_templates: KitTemplatesEntity,
	kit_uploaded_files: KitUploadedFilesEntity,
	kit_usage_limit_agent_days: KitUsageLimitAgentDaysEntity,
	kit_usage_limit_agent_months: KitUsageLimitAgentMonthsEntity,
	kit_usage_limit_days: KitUsageLimitDaysEntity,
	kit_usage_limit_members: KitUsageLimitMembersEntity,
	kit_usage_limit_months: KitUsageLimitMonthsEntity,
	kit_usage_limit_overrides: KitUsageLimitOverridesEntity,
	kit_usage_limit_policy: KitUsageLimitPolicyEntity,
	kit_usage_limit_requests: KitUsageLimitRequestsEntity,
	kit_usage_limit_sessions: KitUsageLimitSessionsEntity,
	kit_usage_limit_templates: KitUsageLimitTemplatesEntity,
	quota_override: QuotaOverrideEntity,
	quota_pack: QuotaPackEntity,
	quota_policy: QuotaPolicyEntity,
	quota_request: QuotaRequestEntity,
	usage_turns: UsageTurnsEntity,
} as const;
