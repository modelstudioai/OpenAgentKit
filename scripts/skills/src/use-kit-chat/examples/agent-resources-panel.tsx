import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
import type {
	AgentMemoryStore,
	AgentResourceItem,
	AgentSummary,
	ArtifactDescriptor,
	RemoteAgentResources,
} from "@openagentkit/sdk/protocol";
import { ArtifactCard, SubAgentPanel } from "@openagentpack/kit-chat-ui";
import type { ReactNode } from "react";

function ResourceSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<details open className="kit-collapse min-w-0 py-2">
			<summary className="cursor-pointer font-medium text-[var(--kit-fg)]">{title}</summary>
			<div className="mt-2 min-w-0 text-sm text-[var(--kit-fg-muted)]">{children}</div>
		</details>
	);
}

function ResourceList({ items }: { items: AgentResourceItem[] }) {
	return (
		<ul className="space-y-1">
			{items.map(({ name, permission }) => (
				<li key={name} className="wrap-anywhere">
					{name}
					{permission ? <span className="ml-2">{permission === "ask" ? "每次询问" : "始终允许"}</span> : null}
				</li>
			))}
		</ul>
	);
}

export function AgentResourcesPanel({
	agent,
	resources,
	multiAgent,
	artifacts,
	onArtifactOpen,
	onArtifactDownload,
}: {
	agent: AgentSummary | null;
	resources: (RemoteAgentResources & { memory_stores?: AgentMemoryStore[] }) | null;
	multiAgent?: ChatMultiAgent;
	artifacts: ArtifactDescriptor[];
	onArtifactOpen?: (fileId: string, contentType?: string) => void;
	onArtifactDownload?: (fileId: string) => void;
}) {
	return (
		<section aria-label="Agent 详情与资源" className="min-w-0 space-y-2">
			<ResourceSection title="Agent 信息">
				<p className="wrap-anywhere font-medium text-[var(--kit-fg)]">{agent?.display_name ?? "暂无 Agent 详情"}</p>
				{agent?.description ? <p className="mt-1 wrap-anywhere">{agent.description}</p> : null}
			</ResourceSection>
			<SubAgentPanel multiAgent={multiAgent} />
			{resources?.skills.length ? (
				<ResourceSection title="技能">
					<ResourceList items={resources.skills} />
				</ResourceSection>
			) : null}
			{resources?.mcp_servers.length ? (
				<ResourceSection title="MCP 服务">
					<ResourceList items={resources.mcp_servers} />
				</ResourceSection>
			) : null}
			{resources?.tools.length ? (
				<ResourceSection title="工具">
					<ResourceList items={resources.tools} />
				</ResourceSection>
			) : null}
			{resources?.memory_stores?.length ? (
				<ResourceSection title="记忆库">
					<ul className="space-y-2">
						{resources.memory_stores.map((store) => (
							<li key={store.name} className="wrap-anywhere">
								<p className="font-medium text-[var(--kit-fg)]">{store.name}</p>
								{store.description ? <p>{store.description}</p> : null}
							</li>
						))}
					</ul>
				</ResourceSection>
			) : null}
			<ResourceSection title="会话产物">
				{artifacts.length ? (
					<ul className="space-y-2">
						{artifacts.map(({ file_id, filename, content_type }) => (
							<li key={file_id} className="flex min-w-0">
								<ArtifactCard
									filename={filename ?? file_id}
									contentType={content_type}
									onOpen={onArtifactOpen && (() => onArtifactOpen(file_id, content_type))}
									onDownload={onArtifactDownload && (() => onArtifactDownload(file_id))}
								/>
							</li>
						))}
					</ul>
				) : (
					<p>本会话生成的文件会显示在这里。</p>
				)}
			</ResourceSection>
		</section>
	);
}
