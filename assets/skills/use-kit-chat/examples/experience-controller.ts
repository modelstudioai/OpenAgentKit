import { createComposer, deriveTitle } from "@openagentkit/sdk/chat";
import {
	type ArtifactHost,
	createArtifactActions,
	createAttachments,
	previewableArtifactType,
	resolveArtifactType,
} from "@openagentkit/sdk/files";
import type { MemberUsageLimitView } from "@openagentkit/sdk/protocol";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import {
	createSessionActions,
	createSessionDetails,
	createSessionDirectory,
	createSessionSearch,
} from "@openagentkit/sdk/sessions";
import { createQuotaRecovery, readQuotaExceeded, usageLimitsAllowSending } from "@openagentkit/sdk/usage";

// 非 React 宿主管理订阅和销毁。每个控制器负责一项独立能力。
export function createExperienceControllers(client: KitClient, host: ArtifactHost) {
	const directory = createSessionDirectory(client);
	const search = createSessionSearch(client);
	const details = createSessionDetails(client, null);
	const actions = createSessionActions(client, () => directory.reload());
	const attachments = createAttachments(client);
	const composer = createComposer(client);
	const artifacts = createArtifactActions(client, host);
	const quota = createQuotaRecovery(client);
	directory.start();
	return {
		directory,
		search,
		details,
		actions,
		attachments,
		composer,
		artifacts,
		quota,
		dispose() {
			for (const controller of [directory, search, details, actions, attachments, composer, artifacts, quota])
				controller.dispose();
		},
	};
}
export function presentationHelpers(error: unknown, limits: MemberUsageLimitView) {
	return {
		title: deriveTitle("第一条消息"),
		quotaError: readQuotaExceeded(error),
		canRecover: usageLimitsAllowSending(limits),
		type: resolveArtifactType(undefined, "report.pdf", "application/octet-stream"),
		canPreview: previewableArtifactType("application/pdf"),
	};
}
