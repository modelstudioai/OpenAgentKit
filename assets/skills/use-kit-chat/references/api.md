# API 参考

本页由 `pnpm gen:skills` 生成。更新公开 TypeScript 声明或中文 catalog 后重新生成。
字段类型和必填性来自公开 API，行为说明依据所列文档整理。
组件表格列出 Kit 自有属性。组件按声明继承标准的 React/DOM 属性。

## 目录

- [useAgentResources](#useagentresources)
- [useUsageLimits](#useusagelimits)
- [createChatController](#createchatcontroller)
- [ChatController](#chatcontroller)
- [createSessionStore](#createsessionstore)
- [SessionStoreOptions](#sessionstoreoptions)
- [useChat](#usechat)
- [UseChatOptions](#usechatoptions)
- [UseChatResult](#usechatresult)
- [send](#send)
- [stop](#stop)
- [refreshApprovals](#refreshapprovals)
- [submitApproval](#submitapproval)
- [KitProvider](#kitprovider)
- [createKitClient](#createkitclient)
- [ChatProvider](#chatprovider)
- [ChatToolApproval](#chattoolapproval)
- [ToolApprovalDecision](#toolapprovaldecision)
- [usePlaza](#useplaza)
- [useQuota](#usequota)
- [useQuotaRequests](#usequotarequests)
- [createMemberAuthController](#creatememberauthcontroller)
- [MemberAuthController](#memberauthcontroller)
- [MemberAuthOptions](#memberauthoptions)
- [MemberAuthSnapshot](#memberauthsnapshot)
- [MemberSessionStorage](#membersessionstorage)
- [StoredMemberSession](#storedmembersession)
- [useMemberAuth](#usememberauth)
- [ChatMultiAgent](#chatmultiagent)
- [ChatAgentThread](#chatagentthread)
- [ChatSnapshot](#chatsnapshot)
- [useSessionDirectory](#usesessiondirectory)
- [useSessionSearch](#usesessionsearch)
- [useSessionDetails](#usesessiondetails)
- [useAttachments](#useattachments)
- [useComposer](#usecomposer)
- [useArtifactActions](#useartifactactions)
- [useQuotaRecovery](#usequotarecovery)
- [useCreateQuotaRequest](#usecreatequotarequest)
- [createSessionDirectory](#createsessiondirectory)
- [createSessionSearch](#createsessionsearch)
- [createSessionDetails](#createsessiondetails)
- [createSessionActions](#createsessionactions)
- [createAttachments](#createattachments)
- [createComposer](#createcomposer)
- [deriveTitle](#derivetitle)
- [createArtifactActions](#createartifactactions)
- [resolveArtifactType](#resolveartifacttype)
- [previewableArtifactType](#previewableartifacttype)
- [createQuotaRecovery](#createquotarecovery)
- [readQuotaExceeded](#readquotaexceeded)
- [usageLimitsAllowSending](#usagelimitsallowsending)
- [createQuery](#createquery)
- [createMutation](#createmutation)
- [createObservable](#createobservable)
- [QuerySnapshot](#querysnapshot)
- [相关类型](#相关类型)

## useAgentResources

通过显式或 Context 中的 KitClient 读取当前 Agent 的工具、MCP、技能和记忆库摘要。

从 `@openagentkit/sdk/agents/hooks` 导入 `useAgentResources`。
公开入口为 `packages/sdk/src/agents/hooks/index.ts`，声明位于 `packages/sdk/src/agents/hooks/use-agent-resources.ts`。
说明来自 `apps/storybook/content/docs/sdk/discovery-usage.mdx`。
[可编译示例](../examples/experience.tsx)

- 传入 null 跳过查询。这个应用查询独立于显式 ChatProvider。

```ts
export function useAgentResources(slug: string | null, options?: { client?: KitClient; }): { memory_stores?: { name: string; description?: string | undefined; }[] | undefined; tools: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; skills: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; mcp_servers: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; } | null;
```


<!-- source-sha256: 264b8d29d1436b1cbc21d18f844ccb26a7d9b0e4f1f52460cf47dde6fdbc419b; doc-sha256: 64bf687cc63bf830003ce6c346d5f544f3fc6c6006782970ffe57d87035703fc -->

## useUsageLimits

通过 Context 中的 KitClient 观察本地成员用量限制，包含加载、错误、数据及显式重载。

从 `@openagentkit/sdk/usage/hooks` 导入 `useUsageLimits`。
公开入口为 `packages/sdk/src/usage/hooks/index.ts`，声明位于 `packages/sdk/src/usage/hooks/use-usage-limits.ts`。
说明来自 `apps/storybook/content/docs/sdk/discovery-usage.mdx`。
[可编译示例](../examples/experience-data.tsx)

- 只有成功返回 null 才表示当前身份不是本地成员，请求错误时不能放开用量限制。

```ts
export function useUsageLimits(options?: { client?: KitClient; enabled?: boolean; days?: number; }): { reload: () => Promise<{ member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; }; override: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; } | null; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string | undefined; } | null | undefined>; data: { member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; }; override: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; } | null; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string | undefined; } | null | undefined; loading: boolean; error: string | null; };
```


<!-- source-sha256: 03cede5e643d6616b0ce387706848ef0c0316524008ca74f674e16fce04cb355; doc-sha256: 64bf687cc63bf830003ce6c346d5f544f3fc6c6006782970ffe57d87035703fc -->

## createChatController

独立于框架，管理一个会话的订阅、消息状态和执行操作。

从 `@openagentkit/sdk/chat` 导入 `createChatController`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/controller.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/controller.ts)

- connect 在收到权威就绪信号后返回，持久订阅继续运行。
- 只有控制器调度重连，写请求禁止自动重发。
- 宿主在结束管理时取消订阅并销毁控制器。
- 使用 Provider 提供的消息策略，省略时使用 transformSessionEvent。状态归 Chat 持有。

```ts
export function createChatController(client: ChatProvider, sessionId: string, options?: { backoff?: BackoffOptions; }): ChatController;
```


<!-- source-sha256: e20e9b280ba507493c25dc00f372a2da98e8fec796b382dd41b4218275423c99; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## ChatController

独立于 React 的快照订阅、发送、停止和审批操作，以及显式销毁。

从 `@openagentkit/sdk/chat` 导入 `ChatController`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/controller.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/controller.ts)


```ts
import type { ChatController } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `store` | 是 | `SessionStore` |
| `getSnapshot` | 是 | `() => ChatSnapshot` |
| `subscribe` | 是 | `(listener: () => void) => () => void` |
| `connect` | 是 | `() => Promise<void>` |
| `send` | 是 | `(text: string, options?: ChatSendOptions) => Promise<void>` |
| `stop` | 是 | `() => Promise<void>` |
| `refreshApprovals` | 是 | `() => Promise<void>` |
| `submitApproval` | 是 | `(decision: ToolApprovalDecision) => Promise<void>` |
| `dispose` | 是 | `() => void` |
| `connected` | 是 | `boolean` |

<!-- source-sha256: e20e9b280ba507493c25dc00f372a2da98e8fec796b382dd41b4218275423c99; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## createSessionStore

持有事件快照及 Chat 状态，重建时调用可选的注入式消息策略。

从 `@openagentkit/sdk/chat` 导入 `createSessionStore`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/session-store.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/controller.ts)

- 直接使用 Store 的调用方管理事件交付。useChat 的调用方在 Provider 配置策略。
- 省略 transformMessage 时使用 transformSessionEvent。

```ts
export function createSessionStore(initialSessionId?: string | null, options?: SessionStoreOptions): SessionStore;
```


<!-- source-sha256: 0cb972d700618d48a9b0a652568871a2c1ed0c6c2e892f7c2d4af8e62b8d577d; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## SessionStoreOptions

独立管理会话 Store 时可选的消息转换策略。

从 `@openagentkit/sdk/chat` 导入 `SessionStoreOptions`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/session-store.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/controller.ts)


```ts
import type { SessionStoreOptions } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `transformMessage` | 否 | `MessageTransformer \| undefined` |

<!-- source-sha256: 0cb972d700618d48a9b0a652568871a2c1ed0c6c2e892f7c2d4af8e62b8d577d; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## useChat

通过 KitProvider 或显式传入的稳定 ChatProvider 订阅一个会话。

从 `@openagentkit/sdk/chat/hooks` 导入 `useChat`。
公开入口为 `packages/sdk/src/chat/hooks/index.ts`，声明位于 `packages/sdk/src/chat/hooks/use-chat.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/default-chat.tsx)

- 选择或创建会话前传 null，此时跳过订阅。
- 显式 Provider 重载可独立于 KitProvider 使用，且优先于 Context。
- 消息、输入和审批界面共用同一个 Hook 的结果。

```ts
export function useChat(sessionId: string | null): UseChatResult;
export function useChat(options: UseChatOptions): UseChatResult;
```


<!-- source-sha256: 3b3bbbf486b6f93b92d4325e9c6894abaedbdff75a0869dec35bbd95010bdbc1; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## UseChatOptions

使用应用提供的 ChatProvider 时的会话配置。

从 `@openagentkit/sdk/chat/hooks` 导入 `UseChatOptions`。
公开入口为 `packages/sdk/src/chat/hooks/index.ts`，声明位于 `packages/sdk/src/chat/hooks/use-chat.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/custom-chat.tsx)

- sessionId 和 provider 均为必填，sessionId 可为 null。
- Provider 实例或会话 ID 变化时替换控制器。

```ts
import type { UseChatOptions } from "@openagentkit/sdk/chat/hooks";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sessionId` | 是 | `string \| null` |
| `provider` | 是 | `ChatProvider` |

<!-- source-sha256: 3b3bbbf486b6f93b92d4325e9c6894abaedbdff75a0869dec35bbd95010bdbc1; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## UseChatResult

消息投影、连接与执行状态、待审批项及异步操作。

从 `@openagentkit/sdk/chat/hooks` 导入 `UseChatResult`。
公开入口为 `packages/sdk/src/chat/hooks/index.ts`，声明位于 `packages/sdk/src/chat/hooks/use-chat.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/default-chat.tsx)

- connected 仅反映连接。canSend 还考虑执行和会话状态。
- 权威快照可能替换消息及分片，须保留稳定 ID。
- turnRunning 包含等待审批及等待中断确认的阶段。
- 公开操作以当前类型为准，禁止自行创建消息修改、重新生成或请求队列接口。

```ts
import type { UseChatResult } from "@openagentkit/sdk/chat/hooks";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `messages` | 是 | `ChatMessage[]` |
| `threads` | 是 | `Record<string, ChatMessage[]>` |
| `multiAgent` | 是 | `ChatMultiAgent` |
| `artifacts` | 是 | `ArtifactDescriptor[]` |
| `turnRunning` | 是 | `boolean` |
| `streamError` | 是 | `{ code: string; message: string; } \| null` |
| `connected` | 是 | `boolean` |
| `phase` | 是 | `TurnPhase` |
| `connection` | 是 | `ConnectionState` |
| `canSend` | 是 | `boolean` |
| `approvals` | 是 | `ChatToolApproval[]` |
| `refreshApprovals` | 是 | `() => Promise<void>` |
| `submitApproval` | 是 | `(decision: ToolApprovalDecision) => Promise<void>` |
| `send` | 是 | `(text: string, options?: { sessionId?: string; attachments?: AttachmentRef[]; skills?: string[]; }) => Promise<void>` |
| `setMessageFiles` | 是 | `(entries: MessageFileAssociation[] \| null) => void` |
| `stop` | 是 | `() => Promise<void>` |

<!-- source-sha256: 3b3bbbf486b6f93b92d4325e9c6894abaedbdff75a0869dec35bbd95010bdbc1; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## send

等待订阅就绪并提交一次消息，可显式指定刚创建的会话。

从 `@openagentkit/sdk/chat/hooks` 导入 `UseChatResult`。
公开入口为 `packages/sdk/src/chat/hooks/index.ts`，声明位于 `packages/sdk/src/chat/hooks/use-chat.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/custom-chat.tsx)

- Promise 成功表示已受理，Agent 回应的完成由业务事件确定。
- 失败时保留草稿，连接恢复时禁止自动重发。
- 创建后立即传 options.sessionId，避免引用上一次渲染选中的 ID。

```ts
// send 的类型
(text: string, options?: { sessionId?: string; attachments?: AttachmentRef[]; skills?: string[]; }) => Promise<void>
```


<!-- source-sha256: 3b3bbbf486b6f93b92d4325e9c6894abaedbdff75a0869dec35bbd95010bdbc1; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## stop

请求中断远端执行并等待请求结果。

从 `@openagentkit/sdk/chat/hooks` 导入 `UseChatResult`。
公开入口为 `packages/sdk/src/chat/hooks/index.ts`，声明位于 `packages/sdk/src/chat/hooks/use-chat.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/default-chat.tsx)

- 请求成功表示已受理，是否停止由 Provider 事件确认。
- 切换会话和卸载只取消浏览器订阅。

```ts
// stop 的类型
() => Promise<void>
```


<!-- source-sha256: 3b3bbbf486b6f93b92d4325e9c6894abaedbdff75a0869dec35bbd95010bdbc1; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## refreshApprovals

查询当前待审批工具集合，适用于结果不确定或决定已过期的情况。

从 `@openagentkit/sdk/chat/hooks` 导入 `UseChatResult`。
公开入口为 `packages/sdk/src/chat/hooks/index.ts`，声明位于 `packages/sdk/src/chat/hooks/use-chat.ts`。
说明来自 `apps/storybook/content/docs/sdk/tool-approvals.mdx`。
[可编译示例](../examples/approval-list.tsx)

- 先查询，再由用户显式确认，禁止自动重复提交审批 POST。

```ts
// refreshApprovals 的类型
() => Promise<void>
```


<!-- source-sha256: 3b3bbbf486b6f93b92d4325e9c6894abaedbdff75a0869dec35bbd95010bdbc1; doc-sha256: 03e164c0199edd9510cc7c6ebd1036abc697a376d45c2586623da56a188c80aa -->

## submitApproval

刷新并校验一项当前工具请求，再提交用户的允许或拒绝决定。

从 `@openagentkit/sdk/chat/hooks` 导入 `UseChatResult`。
公开入口为 `packages/sdk/src/chat/hooks/index.ts`，声明位于 `packages/sdk/src/chat/hooks/use-chat.ts`。
说明来自 `apps/storybook/content/docs/sdk/tool-approvals.mdx`。
[可编译示例](../examples/approval-list.tsx)

- 参数或有效性变化时，须重新审阅与确认。
- 后端独立校验归属、当前批次和调用，以及是否已有回复。

```ts
// submitApproval 的类型
(decision: ToolApprovalDecision) => Promise<void>
```


<!-- source-sha256: 3b3bbbf486b6f93b92d4325e9c6894abaedbdff75a0869dec35bbd95010bdbc1; doc-sha256: 03e164c0199edd9510cc7c6ebd1036abc697a376d45c2586623da56a188c80aa -->

## KitProvider

为默认数据 Hook 提供稳定 KitClient 的 React Context。

从 `@openagentkit/sdk/providers/kit/react` 导入 `KitProvider`。
公开入口为 `packages/sdk/src/providers/kit/react/index.ts`，声明位于 `packages/sdk/src/providers/kit/react/context.tsx`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/default-chat.tsx)

- KitProvider 负责 React Context，ChatProvider 负责会话适配，ProviderGateway 则负责服务端网关。
- useSessions 和 useKitClient 继续从数据 Client 获取数据。
- 宿主能力由接入应用实现。

```ts
export function KitProvider({ client, children }: { client: KitClient; children: ReactNode; }): JSX.Element;
```


<!-- source-sha256: 56e8db9834976d7c7c2e4655e141009769b55abcaa5ec7d06ce0ab8ebdcf9674; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## createKitClient

使用运行时 API base URL 和应用身份头创建默认 Kit Server 客户端。

从 `@openagentkit/sdk/providers/kit` 导入 `createKitClient`。
公开入口为 `packages/sdk/src/providers/kit/index.ts`，声明位于 `packages/sdk/src/providers/kit/client.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/default-chat.tsx)

- 支持页面和 API 不同源。
- 会话创建和文件操作通过独立的应用调用完成。

```ts
export function createKitClient(options: KitClientOptions): KitClient;
```


<!-- source-sha256: b1d68783a14b07a56ca56019c8d30a84c70b7fc05f9e81068aabd2506493a5d8; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## ChatProvider

传给 useChat 的五个必需后端方法及可选的消息转换策略。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/custom-chat.tsx)

- 跨渲染保持 Provider 实例稳定。
- Provider 定义转换。Chat 基于最新事件账本调用策略并持有消息。

```ts
import type { ChatProvider } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `transformMessage` | 否 | `MessageTransformer \| undefined` |
| `listThreads` | 否 | `((sessionId: string, options?: ThreadQueryOptions) => Promise<SessionThreadsResponse>) \| undefined` |
| `listThreadEvents` | 否 | `((sessionId: string, threadId: string, options?: ThreadQueryOptions) => Promise<EventsPage>) \| undefined` |
| `stream` | 是 | `(sessionId: string, options?: StreamSessionOptions) => Promise<void>` |
| `sendMessage` | 是 | `(sessionId: string, body: SendMessageRequest) => Promise<SendMessageResponse>` |
| `interrupt` | 是 | `(sessionId: string) => Promise<{ interrupted: boolean; }>` |
| `toolApprovals` | 是 | `(sessionId: string) => Promise<ToolApprovalsResponse>` |
| `submitToolApproval` | 是 | `(sessionId: string, decision: ToolApprovalDecision) => Promise<SendMessageResponse>` |

<!-- source-sha256: c4e84b4c02532fce8688a82d9260197872172cd0fd1b8629f24441d005963332; doc-sha256: 7c8018529fae930d92e8e17a9b66ca47a7b451905566e8e916c72aa7809eb71b -->

## ChatToolApproval

工具请求的界面投影，包含 pending、submitting、submitted、uncertain 或 stale 状态。

从 `@openagentkit/sdk/chat` 导入 `ChatToolApproval`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/session-store.ts`。
说明来自 `apps/storybook/content/docs/sdk/tool-approvals.mdx`。
[可编译示例](../examples/approval-list.tsx)

- 只有 pending 且可操作的请求可确认。
- 以当前 batch_id 和 call_id 为标识。

```ts
export type ChatToolApproval = Omit<{ batch_id: string; call_id: string; request_event_id: string | null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string | undefined; session_thread_id?: string | undefined; status?: "pending" | "submitted" | "uncertain" | undefined; result?: "allow" | "deny" | undefined; }, "status"> & { status: "pending" | "submitting" | "submitted" | "uncertain" | "stale"; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `batch_id` | 是 | `string` |
| `call_id` | 是 | `string` |
| `request_event_id` | 是 | `string \| null` |
| `name` | 是 | `string` |
| `arguments` | 是 | `unknown` |
| `tool_type` | 是 | `string` |
| `server_label` | 否 | `string \| undefined` |
| `session_thread_id` | 否 | `string \| undefined` |
| `actionable` | 是 | `boolean` |
| `result` | 否 | `"allow" \| "deny" \| undefined` |
| `status` | 是 | `"pending" \| "submitted" \| "uncertain" \| "submitting" \| "stale"` |

<!-- source-sha256: 0cb972d700618d48a9b0a652568871a2c1ed0c6c2e892f7c2d4af8e62b8d577d; doc-sha256: 03e164c0199edd9510cc7c6ebd1036abc697a376d45c2586623da56a188c80aa -->

## ToolApprovalDecision

用当前批次与调用标识的一次显式允许或拒绝决定。

从 `@openagentkit/sdk/protocol` 导入 `ToolApprovalDecision`。
公开入口为 `packages/sdk/src/protocol/index.ts`，声明位于 `packages/sdk/src/protocol/tool-approvals.ts`。
说明来自 `apps/storybook/content/docs/sdk/tool-approvals.mdx`。
[可编译示例](../examples/approval-list.tsx)

- 可选的 deny_message 在 Kit 中最多 200 字符。
- 拒绝只作用于该工具调用。停止整个会话通过独立的中断操作完成。

```ts
export type ToolApprovalDecision = { batch_id: string; call_id: string; result: "allow" | "deny"; deny_message?: string | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `batch_id` | 是 | `string` |
| `call_id` | 是 | `string` |
| `result` | 是 | `"allow" \| "deny"` |
| `deny_message` | 否 | `string \| undefined` |

<!-- source-sha256: d2f0f317f4cf23f039f2a01196acb1a226be2fa48e2800bcf62c4021030a005d; doc-sha256: 03e164c0199edd9510cc7c6ebd1036abc697a376d45c2586623da56a188c80aa -->

## usePlaza

读取 Kit Server 的广场条目、分类及推荐和热门 slug 列表。

从 `@openagentkit/sdk/agents/hooks` 导入 `usePlaza`。
公开入口为 `packages/sdk/src/agents/hooks/index.ts`，声明位于 `packages/sdk/src/agents/hooks/use-plaza.ts`。
说明来自 `apps/storybook/content/docs/sdk/discovery-usage.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 需要 KitProvider，显式 ChatProvider 只接管对话操作。
- category 或 q 变化时加载，reload 请求新快照。

```ts
export function usePlaza(options?: { client?: KitClient; category?: PlazaCategory; q?: string; }): { view: { agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string | undefined; }; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" | "general" | "writing" | "coding" | "other"; name: string; count: number; }[]; } | null; reload: () => Promise<{ agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string | undefined; }; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" | "general" | "writing" | "coding" | "other"; name: string; count: number; }[]; } | undefined>; data: { agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string | undefined; }; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" | "general" | "writing" | "coding" | "other"; name: string; count: number; }[]; } | undefined; loading: boolean; error: string | null; };
```


<!-- source-sha256: b1926f867ac3ba5b07425e39a4d3ffc26d6ca0e678081f8161b88078b20f3bc6; doc-sha256: 64bf687cc63bf830003ce6c346d5f544f3fc6c6006782970ffe57d87035703fc -->

## useQuota

读取月度 Credits、加量包、每日用量及当前待处理的额度申请。

从 `@openagentkit/sdk/usage/hooks` 导入 `useQuota`。
公开入口为 `packages/sdk/src/usage/hooks/index.ts`，声明位于 `packages/sdk/src/usage/hooks/use-quota.ts`。
说明来自 `apps/storybook/content/docs/sdk/discovery-usage.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 需要 KitProvider，服务端负责执行额度限制。
- limit 不含加量包，remaining 为 -1 表示不限量。

```ts
export function useQuota(options?: { client?: KitClient; days?: number; }): { quota: { month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number | null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string | undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; } | null; } | null; reload: () => Promise<{ month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number | null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string | undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; } | null; } | undefined>; data: { month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number | null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string | undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; } | null; } | undefined; loading: boolean; error: string | null; };
```


<!-- source-sha256: 69cc3fd8e03c994aab981f569007286ad5acd20c2436da5d22a51a3071277c1d; doc-sha256: 64bf687cc63bf830003ce6c346d5f544f3fc6c6006782970ffe57d87035703fc -->

## useQuotaRequests

读取当前身份的额度增加申请历史。

从 `@openagentkit/sdk/usage/hooks` 导入 `useQuotaRequests`。
公开入口为 `packages/sdk/src/usage/hooks/index.ts`，声明位于 `packages/sdk/src/usage/hooks/use-quota-requests.ts`。
说明来自 `apps/storybook/content/docs/sdk/discovery-usage.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 需要 KitProvider。
- 查询失败时 requests 会清空为 []，当前接口不提供 error 字段。

```ts
export function useQuotaRequests(options?: { client?: KitClient; }): { requests: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }[]; reload: () => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }[] | undefined>; data: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }[] | undefined; loading: boolean; error: string | null; };
```


<!-- source-sha256: 06ab02741f46208caf9166aaebcfe23b8338648deaa4d3e1b667985fd481b008; doc-sha256: 64bf687cc63bf830003ce6c346d5f544f3fc6c6006782970ffe57d87035703fc -->

## createMemberAuthController

管理本地成员登录、恢复、撤销及过期，为每个 generation 使用一个固定身份的 Client。

从 `@openagentkit/sdk/auth` 导入 `createMemberAuthController`。
公开入口为 `packages/sdk/src/auth/index.ts`，声明位于 `packages/sdk/src/auth/member-auth.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/member-auth.tsx)


```ts
export function createMemberAuthController(options: MemberAuthOptions): { getSnapshot: () => MemberAuthSnapshot; subscribe: (listener: () => void) => () => void; start: () => Promise<void>; login: (input: MemberLoginRequest) => Promise<void>; logout: () => Promise<void>; retry: () => Promise<void>; dispose: () => void; };
```


<!-- source-sha256: 445a244f58041b227620bc9d126f928672b9f7d523f3b529b9fe349ab312e9a3; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## MemberAuthController

独立于框架的成员认证生命周期与可订阅快照。

从 `@openagentkit/sdk/auth` 导入 `MemberAuthController`。
公开入口为 `packages/sdk/src/auth/index.ts`，声明位于 `packages/sdk/src/auth/member-auth.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/member-auth.tsx)


```ts
export type MemberAuthController = { getSnapshot: () => MemberAuthSnapshot; subscribe: (listener: () => void) => () => void; start: () => Promise<void>; login: (input: MemberLoginRequest) => Promise<void>; logout: () => Promise<void>; retry: () => Promise<void>; dispose: () => void; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `getSnapshot` | 是 | `() => MemberAuthSnapshot` |
| `subscribe` | 是 | `(listener: () => void) => () => void` |
| `start` | 是 | `() => Promise<void>` |
| `login` | 是 | `(input: MemberLoginRequest) => Promise<void>` |
| `logout` | 是 | `() => Promise<void>` |
| `retry` | 是 | `() => Promise<void>` |
| `dispose` | 是 | `() => void` |

<!-- source-sha256: 445a244f58041b227620bc9d126f928672b9f7d523f3b529b9fe349ab312e9a3; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## MemberAuthOptions

最终 API URL、显式鉴权模式、宿主存储和可选的 fetch 实现。

从 `@openagentkit/sdk/auth` 导入 `MemberAuthOptions`。
公开入口为 `packages/sdk/src/auth/index.ts`，声明位于 `packages/sdk/src/auth/member-auth.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/member-auth.tsx)


```ts
import type { MemberAuthOptions } from "@openagentkit/sdk/auth";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `baseUrl` | 是 | `string` |
| `mode` | 是 | `"member" \| "anonymous"` |
| `storage` | 是 | `MemberSessionStorage` |
| `fetchImpl` | 否 | `{ (input: RequestInfo \| URL, init?: RequestInit): Promise<Response>; (input: string \| URL \| Request, init?: RequestInit): Promise<Response>; } \| undefined` |
| `createChatProvider` | 否 | `((request: RequestClient) => ChatProvider) \| undefined` |
| `createClient` | 否 | `((request: RequestClient) => KitClient) \| undefined` |

<!-- source-sha256: 445a244f58041b227620bc9d126f928672b9f7d523f3b529b9fe349ab312e9a3; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## MemberAuthSnapshot

认证状态、公开成员资料、隔离的 Client、generation、待处理状态及错误。

从 `@openagentkit/sdk/auth` 导入 `MemberAuthSnapshot`。
公开入口为 `packages/sdk/src/auth/index.ts`，声明位于 `packages/sdk/src/auth/member-auth.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/member-auth.tsx)


```ts
import type { MemberAuthSnapshot } from "@openagentkit/sdk/auth";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `status` | 是 | `"error" \| "anonymous" \| "checking" \| "signed-out" \| "signed-in"` |
| `member` | 是 | `{ member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number \| null; covered_sessions: number; }; output_tokens: { value: number \| null; covered_sessions: number; }; cache_read_input_tokens: { value: number \| null; covered_sessions: number; }; cache_creation_input_tokens: { value: number \| null; covered_sessions: number; }; active_seconds: { value: number \| null; covered_sessions: number; }; duration_seconds: { value: number \| null; covered_sessions: number; }; }; agents: { slug: string; display_name: string \| null; catalog_entry_id?: string \| null \| undefined; deleted?: boolean \| undefined; }[]; refresh_status: "idle" \| "refreshing" \| "partial" \| "failed"; completed_sessions: number; refreshed_at?: string \| undefined; } \| undefined; email?: string \| undefined; } \| null` |
| `client` | 是 | `KitClient \| null` |
| `chatProvider` | 是 | `ChatProvider \| null` |
| `generation` | 是 | `number` |
| `error` | 是 | `string \| null` |
| `pending` | 是 | `boolean` |

<!-- source-sha256: 445a244f58041b227620bc9d126f928672b9f7d523f3b529b9fe349ab312e9a3; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## MemberSessionStorage

按完整 API URL 隔离的宿主存储适配器，只保存会话令牌及有效期。

从 `@openagentkit/sdk/auth` 导入 `MemberSessionStorage`。
公开入口为 `packages/sdk/src/auth/index.ts`，声明位于 `packages/sdk/src/auth/member-auth.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/member-auth.tsx)


```ts
import type { MemberSessionStorage } from "@openagentkit/sdk/auth";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `load` | 是 | `() => StoredMemberSession \| null` |
| `save` | 是 | `(session: StoredMemberSession \| null) => void` |

<!-- source-sha256: 445a244f58041b227620bc9d126f928672b9f7d523f3b529b9fe349ab312e9a3; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## StoredMemberSession

不透明的成员访问令牌及其固定过期时间。

从 `@openagentkit/sdk/auth` 导入 `StoredMemberSession`。
公开入口为 `packages/sdk/src/auth/index.ts`，声明位于 `packages/sdk/src/auth/member-auth.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/member-auth.tsx)


```ts
import type { StoredMemberSession } from "@openagentkit/sdk/auth";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `access_token` | 是 | `string` |
| `expires_at` | 是 | `string` |

<!-- source-sha256: 445a244f58041b227620bc9d126f928672b9f7d523f3b529b9fe349ab312e9a3; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## useMemberAuth

订阅稳定的成员认证控制器，并将启动及销毁绑定到 React 生命周期。

从 `@openagentkit/sdk/auth/hooks` 导入 `useMemberAuth`。
公开入口为 `packages/sdk/src/auth/hooks/index.ts`，声明位于 `packages/sdk/src/auth/hooks/use-member-auth.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/member-auth.tsx)


```ts
export function useMemberAuth(controller: MemberAuthController): { login: (input: MemberLoginRequest) => Promise<void>; logout: () => Promise<void>; retry: () => Promise<void>; status: "checking" | "signed-out" | "signed-in" | "anonymous" | "error"; member: MemberView | null; client: KitClient | null; chatProvider: ChatProvider | null; generation: number; error: string | null; pending: boolean; };
```


<!-- source-sha256: a856ff2e48f0bdc737bda1936dafc516a08534e08982fa46ca71bd8adbedec6e; doc-sha256: cbb5afaf934c87fa86a6e2b5c6188d34d25230b362d3d6152ff10afd390e5719 -->

## ChatMultiAgent

Chat 原生线程视图，提供独立的加载及分页操作。

从 `@openagentkit/sdk/chat` 导入 `ChatMultiAgent`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/multi-agent.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/custom-chat.tsx)


```ts
import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `selectedThreadId` | 是 | `string \| null` |
| `threads` | 是 | `ChatAgentThread[]` |
| `loading` | 是 | `boolean` |
| `error` | 是 | `string \| null` |
| `selectThread` | 是 | `(id: string \| null) => void` |
| `refreshThreads` | 是 | `() => Promise<void>` |
| `loadThreadEvents` | 是 | `(id: string, options?: { more?: boolean; retry?: boolean; }) => Promise<void>` |

<!-- source-sha256: 7ca860efa036365d451cf376ae879cd390467782c51e2d52c1d6187a8638b406; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## ChatAgentThread

一个子 Agent 实例、投影后的消息、历史状态及显示名。

从 `@openagentkit/sdk/chat` 导入 `ChatAgentThread`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/multi-agent.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/custom-chat.tsx)


```ts
import type { ChatAgentThread } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `id` | 是 | `string` |
| `name` | 是 | `string` |
| `task` | 否 | `string \| undefined` |
| `status` | 是 | `string \| null` |
| `createdAt` | 否 | `string \| undefined` |
| `endedAt` | 否 | `string \| undefined` |
| `messages` | 是 | `ChatMessage[]` |
| `loading` | 是 | `boolean` |
| `error` | 是 | `string \| null` |
| `nextPageToken` | 是 | `string \| null` |
| `historyAvailable` | 是 | `boolean` |
| `loaded` | 是 | `boolean` |

<!-- source-sha256: 7ca860efa036365d451cf376ae879cd390467782c51e2d52c1d6187a8638b406; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## ChatSnapshot

会话状态和原生多 Agent 视图。

从 `@openagentkit/sdk/chat` 导入 `ChatSnapshot`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/controller.ts`。
说明来自 `apps/storybook/content/docs/sdk/use-chat.mdx`。
[可编译示例](../examples/custom-chat.tsx)


```ts
import type { ChatSnapshot } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `multiAgent` | 是 | `ChatMultiAgent` |
| `sessionId` | 是 | `string \| null` |
| `providerStatus` | 是 | `string \| null` |
| `turnRunning` | 是 | `boolean` |
| `phase` | 是 | `TurnPhase` |
| `connection` | 是 | `ConnectionState` |
| `canSend` | 是 | `boolean` |
| `messages` | 是 | `ChatMessage[]` |
| `threads` | 是 | `Record<string, ChatMessage[]>` |
| `artifacts` | 是 | `ArtifactDescriptor[]` |
| `approvals` | 是 | `ChatToolApproval[]` |
| `lastEventId` | 是 | `string \| null` |
| `lastCursor` | 是 | `string \| null` |
| `streamError` | 是 | `{ code: string; message: string; } \| null` |

<!-- source-sha256: e20e9b280ba507493c25dc00f372a2da98e8fec796b382dd41b4218275423c99; doc-sha256: 10da912982514163c0f0824afd29af00f0853f68b4707b1a2641b6fa24d56948 -->

## useSessionDirectory

加载分组和最近会话，保留分页状态并准备显式会话确认。

从 `@openagentkit/sdk/sessions/hooks` 导入 `useSessionDirectory`。
公开入口为 `packages/sdk/src/sessions/hooks/index.ts`，声明位于 `packages/sdk/src/sessions/hooks/use-session-directory.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience.tsx)


```ts
export function useSessionDirectory(options?: { client?: KitClient; onExecuted?: (id: string, action: SessionAction) => void; }): { reload: () => void; reloadGroups: () => void; refreshStatuses: () => Promise<void>; rename: (id: string, title: string) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }>; checkAgent: (slug: string) => Promise<boolean>; observeChat: (state: { sessionId: string | null; phase: string; failed: boolean; }) => void; watchStatuses: (sessionId: string | null, currentExecuting: boolean) => () => void; actions: { request: (sessionId: string, action: SessionAction) => Promise<void>; cancel: () => void; confirm: () => Promise<void>; pending: PendingSessionAction | null; busy: boolean; }; groups: { load(): void; reload(): void; loadMore(): void; retry(): void; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; slug: string; }[]; sessions: { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]; loading: boolean; error: string | null; recent: { applySummaries: (summaries: SessionSummary[]) => void; load(): void; reload(): void; loadMore(): void; retry(): void; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; }; };
```


<!-- source-sha256: 03cc7fd0c52bf9c430cfc0b68ade42ccba747afe981c790821edbb6e3436fd5d; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## useSessionSearch

按会话目录的分页合同查询，支持防抖和取消。

从 `@openagentkit/sdk/sessions/hooks` 导入 `useSessionSearch`。
公开入口为 `packages/sdk/src/sessions/hooks/index.ts`，声明位于 `packages/sdk/src/sessions/hooks/use-session-search.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience.tsx)


```ts
export function useSessionSearch(input: string, options?: { client?: KitClient; debounceMs?: number; }): { load: () => void | undefined; reload: () => void | undefined; loadMore: () => void | undefined; retry: () => void | undefined; query: string; pending: boolean; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; };
```


<!-- source-sha256: 3478174dd20a9b812105107846e9e52813b7dac22677dd0ce2a6a384bfde0276; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## useSessionDetails

加载历史文件元数据并注入已有的 Chat 状态。

从 `@openagentkit/sdk/sessions/hooks` 导入 `useSessionDetails`。
公开入口为 `packages/sdk/src/sessions/hooks/index.ts`，声明位于 `packages/sdk/src/sessions/hooks/use-session-details.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience.tsx)


```ts
export function useSessionDetails(options: { client?: KitClient; sessionId: string | null; setMessageFiles?: (entries: MessageFileAssociation[] | null) => void; }): { reload: () => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; } | null | undefined>; data: { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; } | null | undefined; loading: boolean; error: string | null; };
```


<!-- source-sha256: bbdb5f9fb6937a27196449dfa0e4c05d54c6023d43914fed5ca1e4f2d41c4552; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## useAttachments

负责暂存附件的上传、扫描、取消及消费，选文件界面由宿主提供。

从 `@openagentkit/sdk/files/hooks` 导入 `useAttachments`。
公开入口为 `packages/sdk/src/files/hooks/index.ts`，声明位于 `packages/sdk/src/files/hooks/use-attachments.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience.tsx)


```ts
export function useAttachments(options?: AttachmentsOptions & { client?: KitClient; }): { uploading: boolean; processing: boolean; upload: (picked: UploadSource[]) => Promise<void>; remove: (id: string) => void; clear: () => void; consume: (ids: string[]) => void; files: StagedFile[]; pending: PendingFile[]; failures: FailedFile[]; };
```


<!-- source-sha256: 14205d943f62819650bd25c344f06633ef01a7b01bbf905fd5dabc4e2fdc261b; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## useComposer

通过 Chat.send 发送暂存附件，按需创建会话。受理后清理对应附件，失败时保留。

从 `@openagentkit/sdk/chat/hooks` 导入 `useComposer`。
公开入口为 `packages/sdk/src/chat/hooks/index.ts`，声明位于 `packages/sdk/src/chat/hooks/use-composer.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience.tsx)


```ts
export function useComposer(options: ComposerBinding & { client?: KitClient; }): { send: (text: string, skills?: string[]) => Promise<void>; pending: boolean; error: unknown; };
```


<!-- source-sha256: 261b0ff620bac676e528c6a7d16f84fd8fb898e8389398c9530fb469abea4556; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## useArtifactActions

读取经鉴权的产物字节，通过注入的宿主安全预览或保存。

从 `@openagentkit/sdk/files/hooks` 导入 `useArtifactActions`。
公开入口为 `packages/sdk/src/files/hooks/index.ts`，声明位于 `packages/sdk/src/files/hooks/use-artifact-actions.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience.tsx)


```ts
export function useArtifactActions(options: { client?: KitClient; host: ArtifactHost; sessionId?: string; artifacts?: ArtifactDescriptor[]; }): { open: (id: string, contentType?: string) => Promise<void>; download: (id: string) => Promise<void>; pending: number; error: string | null; };
```


<!-- source-sha256: 78680e18085d7dabdeac32058f6c943ce4dfddf6eb1ee7501f8a1e54a480bf5e; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## useQuotaRecovery

只有新的服务端结果确认全部已启用的限额仍可用后，才恢复发送。

从 `@openagentkit/sdk/usage/hooks` 导入 `useQuotaRecovery`。
公开入口为 `packages/sdk/src/usage/hooks/index.ts`，声明位于 `packages/sdk/src/usage/hooks/use-quota-recovery.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience.tsx)


```ts
export function useQuotaRecovery(options?: { client?: KitClient; }): { recheck: () => Promise<boolean>; loading: boolean; error: string | null; notice: string | null; };
```


<!-- source-sha256: f3ca68dee67de63e0bbae02bc2bb48132beb966b284f03c0c8a0d92921a24378; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## useCreateQuotaRequest

提交一次显式额度申请，禁止自动重试。

从 `@openagentkit/sdk/usage/hooks` 导入 `useCreateQuotaRequest`。
公开入口为 `packages/sdk/src/usage/hooks/index.ts`，声明位于 `packages/sdk/src/usage/hooks/use-create-quota-request.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience.tsx)


```ts
export function useCreateQuotaRequest(options?: { client?: KitClient; }): { submit: (body: { requestedCredits: number; reason?: string; }, signal?: AbortSignal | undefined) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }>; pending: boolean; error: string | null; };
```


<!-- source-sha256: 8293b19ebe9ed26e38da951253746f40ce9332ff269d415227e7ded11b88e031; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createSessionDirectory

独立于框架的会话目录状态、分页及会话操作。

从 `@openagentkit/sdk/sessions` 导入 `createSessionDirectory`。
公开入口为 `packages/sdk/src/sessions/index.ts`，声明位于 `packages/sdk/src/sessions/session-directory.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function createSessionDirectory(client: KitClient, options?: { onExecuted?: (id: string, action: SessionAction) => void; }): { actions: { request: (sessionId: string, action: SessionAction) => Promise<void>; confirm: () => Promise<void>; cancel(): void; dispose(): void; getSnapshot: () => { pending: PendingSessionAction | null; busy: boolean; }; subscribe(listener: () => void): () => boolean; set(next: { pending: PendingSessionAction | null; busy: boolean; }): void; }; reload: () => void; reloadGroups: () => void; refreshStatuses: () => Promise<void>; checkAgent(slug: string): Promise<boolean>; observeChat(state: { sessionId: string | null; phase: string; failed: boolean; }): void; watchStatuses(sessionId: string | null, currentExecuting: boolean): () => void; start(): void; rename: (id: string, title: string) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }>; dispose(): void; getSnapshot: () => { groups: { load(): void; reload(): void; loadMore(): void; retry(): void; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; slug: string; }[]; sessions: { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]; loading: boolean; error: string | null; recent: { applySummaries: (summaries: SessionSummary[]) => void; load(): void; reload(): void; loadMore(): void; retry(): void; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; }; }; subscribe(listener: () => void): () => boolean; set(next: { groups: { load(): void; reload(): void; loadMore(): void; retry(): void; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; slug: string; }[]; sessions: { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]; loading: boolean; error: string | null; recent: { applySummaries: (summaries: SessionSummary[]) => void; load(): void; reload(): void; loadMore(): void; retry(): void; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; }; }): void; };
```


<!-- source-sha256: 48d14034427c0c240c54f595937cba8dd53806b0c9f9268692aa4c8aabb8c53f; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createSessionSearch

独立于框架的防抖搜索，支持取消。

从 `@openagentkit/sdk/sessions` 导入 `createSessionSearch`。
公开入口为 `packages/sdk/src/sessions/index.ts`，声明位于 `packages/sdk/src/sessions/session-directory.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function createSessionSearch(client: KitClient, delayMs?: number): { setQuery(value: string): void; load: () => void | undefined; reload: () => void | undefined; retry: () => void | undefined; loadMore: () => void | undefined; dispose(): void; getSnapshot: () => { query: string; pending: boolean; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; }; subscribe(listener: () => void): () => boolean; set(next: { query: string; pending: boolean; sessions: SessionSummary[]; initialized: boolean; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; }): void; };
```


<!-- source-sha256: 48d14034427c0c240c54f595937cba8dd53806b0c9f9268692aa4c8aabb8c53f; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createSessionDetails

加载会话元数据，按请求代次隔离结果。

从 `@openagentkit/sdk/sessions` 导入 `createSessionDetails`。
公开入口为 `packages/sdk/src/sessions/index.ts`，声明位于 `packages/sdk/src/sessions/session-details.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function createSessionDetails(client: KitClient, sessionId: string | null, setMessageFiles?: (entries: MessageFileAssociation[] | null) => void): { dispose(): void; getSnapshot: () => QuerySnapshot<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; } | null>; subscribe: (listener: () => void) => () => boolean; refresh(): Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; } | null | undefined>; };
```


<!-- source-sha256: 7db805bed893268f4bd0a645676e294b3ba59416d10f898788d1b86573b5cc7f; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createSessionActions

准备、取消和确认会话写操作，失败后须重新获取确认令牌。

从 `@openagentkit/sdk/sessions` 导入 `createSessionActions`。
公开入口为 `packages/sdk/src/sessions/index.ts`，声明位于 `packages/sdk/src/sessions/session-actions.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function createSessionActions(client: KitClient, onExecuted: (id: string, action: SessionAction) => void): { request: (sessionId: string, action: SessionAction) => Promise<void>; confirm: () => Promise<void>; cancel(): void; dispose(): void; getSnapshot: () => { pending: PendingSessionAction | null; busy: boolean; }; subscribe(listener: () => void): () => boolean; set(next: { pending: PendingSessionAction | null; busy: boolean; }): void; };
```


<!-- source-sha256: 12c08fb4576d2a8d65033ca39f7cc395c6afa6f39c42a5ead98766c37011979c; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createAttachments

独立于框架的上传和扫描生命周期。

从 `@openagentkit/sdk/files` 导入 `createAttachments`。
公开入口为 `packages/sdk/src/files/index.ts`，声明位于 `packages/sdk/src/files/attachments.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function createAttachments(client: KitClient, options?: AttachmentsOptions): { upload: (picked: UploadSource[]) => Promise<void>; remove: (id: string) => void; consume(ids: string[]): void; clear(): void; dispose(): void; getSnapshot: () => { files: StagedFile[]; pending: PendingFile[]; failures: FailedFile[]; }; subscribe(listener: () => void): () => boolean; set(next: { files: StagedFile[]; pending: PendingFile[]; failures: FailedFile[]; }): void; };
```


<!-- source-sha256: 8120ea5b889e6c0a2ffd414609ca2bfbb68d2a6eef965c40268523b6a3e33cd2; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createComposer

按需创建会话，并通过已有 Chat 绑定发送。草稿状态由宿主持有。

从 `@openagentkit/sdk/chat` 导入 `createComposer`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/composer.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function createComposer(client: KitClient, options?: { retryDelayMs?: number; }): { setTarget(slug: string | null, id: string | null): void; send(text: string, binding: ComposerBinding, skills?: string[]): Promise<void>; dispose(): void; getSnapshot: () => { pending: boolean; error: unknown; }; subscribe(listener: () => void): () => boolean; set(next: { pending: boolean; error: unknown; }): void; };
```


<!-- source-sha256: deab51693858bf119a4c4cdc085d3a3bd33a7a9cd575cf0915e400f65c2eb8e1; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## deriveTitle

根据首条消息生成会话标题。

从 `@openagentkit/sdk/chat` 导入 `deriveTitle`。
公开入口为 `packages/sdk/src/chat/index.ts`，声明位于 `packages/sdk/src/chat/composer.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function deriveTitle(text: string): string | undefined;
```


<!-- source-sha256: deab51693858bf119a4c4cdc085d3a3bd33a7a9cd575cf0915e400f65c2eb8e1; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createArtifactActions

独立于框架的产物处理流程，通过注入调用宿主操作。

从 `@openagentkit/sdk/files` 导入 `createArtifactActions`。
公开入口为 `packages/sdk/src/files/index.ts`，声明位于 `packages/sdk/src/files/artifacts.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function createArtifactActions(client: KitClient, host: ArtifactHost): { download: (fileId: string, options?: Parameters<(fileId: string, options?: ArtifactActionInput, preview?: boolean) => Promise<void>>[1]) => Promise<void>; open: (fileId: string, options?: Parameters<(fileId: string, options?: ArtifactActionInput, preview?: boolean) => Promise<void>>[1]) => Promise<void>; dispose(): void; getSnapshot: () => { pending: number; error: string | null; }; subscribe(listener: () => void): () => boolean; set(next: { pending: number; error: string | null; }): void; };
```


<!-- source-sha256: 8c7c21b0a44d5b9e4554b113d288b9d08ee746f6511d809a80426ba77b743e21; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## resolveArtifactType

从元数据、文件名和响应中解析产物 MIME 类型。

从 `@openagentkit/sdk/files` 导入 `resolveArtifactType`。
公开入口为 `packages/sdk/src/files/index.ts`，声明位于 `packages/sdk/src/files/artifact-types.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function resolveArtifactType(declared: string | undefined, filename: string, delivered: string): string;
```


<!-- source-sha256: 8e504c660107d7b05ced8c9c5b8a811e7b956ebec7f1e69670bf199ccdb1f4dd; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## previewableArtifactType

允许预览惰性内容，拒绝主动内容。

从 `@openagentkit/sdk/files` 导入 `previewableArtifactType`。
公开入口为 `packages/sdk/src/files/index.ts`，声明位于 `packages/sdk/src/files/artifact-types.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function previewableArtifactType(type: string): boolean;
```


<!-- source-sha256: 8e504c660107d7b05ced8c9c5b8a811e7b956ebec7f1e69670bf199ccdb1f4dd; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createQuotaRecovery

重新读取用量限制后再决定是否允许恢复。

从 `@openagentkit/sdk/usage` 导入 `createQuotaRecovery`。
公开入口为 `packages/sdk/src/usage/index.ts`，声明位于 `packages/sdk/src/usage/quota.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function createQuotaRecovery(client: KitClient): { recheck(): Promise<boolean>; dispose(): void; getSnapshot: () => { loading: boolean; error: string | null; notice: string | null; }; subscribe(listener: () => void): () => boolean; set(next: { loading: boolean; error: string | null; notice: string | null; }): void; };
```


<!-- source-sha256: 4994a0da16da310658524317b1c944492d0d50383b3ef534ef3717ab61b4bf9d; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## readQuotaExceeded

读取已校验的额度详情，以结构化字段为准。

从 `@openagentkit/sdk/usage` 导入 `readQuotaExceeded`。
公开入口为 `packages/sdk/src/usage/index.ts`，声明位于 `packages/sdk/src/usage/quota.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function readQuotaExceeded(error: unknown): QuotaExceededDetails | null;
```


<!-- source-sha256: 4994a0da16da310658524317b1c944492d0d50383b3ef534ef3717ab61b4bf9d; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## usageLimitsAllowSending

要求所有已启用的月度及日度指标均确认为可用。

从 `@openagentkit/sdk/usage` 导入 `usageLimitsAllowSending`。
公开入口为 `packages/sdk/src/usage/index.ts`，声明位于 `packages/sdk/src/usage/quota.ts`。
说明来自 `apps/storybook/content/docs/sdk/experience.mdx`。
[可编译示例](../examples/experience-controller.ts)


```ts
export function usageLimitsAllowSending(view: MemberUsageLimitView): boolean;
```


<!-- source-sha256: 4994a0da16da310658524317b1c944492d0d50383b3ef534ef3717ab61b4bf9d; doc-sha256: 99f8bdad1c73c175a2369fab2bac7df5fdaf8a9a1bc49447df17514c7cc1e52b -->

## createQuery

观察显式刷新的查询，支持取消及请求代次隔离，并保留上次成功快照。

从 `@openagentkit/sdk/state` 导入 `createQuery`。
公开入口为 `packages/sdk/src/state.ts`，声明位于 `packages/sdk/src/state.ts`。
说明来自 `apps/storybook/content/docs/sdk/state.mdx`。
[可编译示例](../examples/call-state.ts)

- 刷新时取消前一次读取。失败时保留数据并返回 undefined。
- 销毁时取消读取并忽略迟到的结果。宿主负责取消订阅。

```ts
export function createQuery<T>(load: (signal: AbortSignal) => Promise<T>): { getSnapshot: () => QuerySnapshot<T>; subscribe: (listener: () => void) => () => boolean; refresh(): Promise<T | undefined>; dispose(): void; };
```


<!-- source-sha256: c445d8ea8478f1309244374e43573505a7c439a7cbd5d5788d92836a517824aa; doc-sha256: f1595b220fd495b40c4fa0cfd42359cbad9036d7c3d935138f81e637eb9e48f9 -->

## createMutation

一次执行一个显式写操作，并提供待处理状态和错误。

从 `@openagentkit/sdk/state` 导入 `createMutation`。
公开入口为 `packages/sdk/src/state.ts`，声明位于 `packages/sdk/src/state.ts`。
说明来自 `apps/storybook/content/docs/sdk/state.mdx`。
[可编译示例](../examples/call-state.ts)

- 写请求不会自动重试或取消，操作失败仍拒绝返回的 Promise。
- 销毁只停止更新快照。新视图应创建自己的控制器。

```ts
export function createMutation<Args extends unknown[], Result>(action: (...args: Args) => Promise<Result>): { getSnapshot: () => { pending: boolean; error: string | null; }; subscribe: (listener: () => void) => () => boolean; run(...args: Args): Promise<Result>; dispose(): void; };
```


<!-- source-sha256: c445d8ea8478f1309244374e43573505a7c439a7cbd5d5788d92836a517824aa; doc-sha256: f1595b220fd495b40c4fa0cfd42359cbad9036d7c3d935138f81e637eb9e48f9 -->

## createObservable

向订阅者发布宿主持有的快照，适用于独立于 React、网络和管理业务的状态。

从 `@openagentkit/sdk/state` 导入 `createObservable`。
公开入口为 `packages/sdk/src/state.ts`，声明位于 `packages/sdk/src/state.ts`。
说明来自 `apps/storybook/content/docs/sdk/state.mdx`。
[可编译示例](../examples/call-state.ts)

- set 替换快照。宿主释放视图时取消订阅。

```ts
export function createObservable<T>(initial: T): { getSnapshot: () => T; subscribe(listener: () => void): () => boolean; set(next: T): void; };
```


<!-- source-sha256: c445d8ea8478f1309244374e43573505a7c439a7cbd5d5788d92836a517824aa; doc-sha256: f1595b220fd495b40c4fa0cfd42359cbad9036d7c3d935138f81e637eb9e48f9 -->

## QuerySnapshot

当前查询目标的数据、加载状态和可读错误。

从 `@openagentkit/sdk/state` 导入 `QuerySnapshot`。
公开入口为 `packages/sdk/src/state.ts`，声明位于 `packages/sdk/src/state.ts`。
说明来自 `apps/storybook/content/docs/sdk/state.mdx`。
[可编译示例](../examples/call-state.ts)


```ts
import type { QuerySnapshot } from "@openagentkit/sdk/state";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `data` | 是 | `T \| undefined` |
| `loading` | 是 | `boolean` |
| `error` | 是 | `string \| null` |

<!-- source-sha256: c445d8ea8478f1309244374e43573505a7c439a7cbd5d5788d92836a517824aa; doc-sha256: f1595b220fd495b40c4fa0cfd42359cbad9036d7c3d935138f81e637eb9e48f9 -->

## 相关类型

以下公开类型可供离线查阅。

### ArtifactActionInput

来自 `@openagentkit/sdk/files`。

```ts
import type { ArtifactActionInput } from "@openagentkit/sdk/files";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sessionId` | 否 | `string \| undefined` |
| `artifacts` | 否 | `ArtifactDescriptor[] \| undefined` |
| `contentType` | 否 | `string \| undefined` |


### ArtifactDescriptor

来自 `@openagentkit/sdk/protocol`。

```ts
import type { ArtifactDescriptor } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `file_id` | 是 | `string` |
| `filename` | 否 | `string \| undefined` |
| `content_type` | 否 | `string \| undefined` |
| `size` | 否 | `number \| undefined` |


### ArtifactHost

来自 `@openagentkit/sdk/files`。

```ts
import type { ArtifactHost } from "@openagentkit/sdk/files";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `reservePreview` | 否 | `(() => { show(blob: Blob): boolean \| Promise<boolean>; close(): void; } \| null) \| undefined` |
| `save` | 否 | `((input: { filename: string; blob: Blob; }) => Promise<boolean>) \| undefined` |
| `fallbackSave` | 是 | `(input: { filename: string; blob: Blob; }) => Promise<boolean>` |


### AttachmentRef

来自 `@openagentkit/sdk/protocol`。

```ts
export type AttachmentRef = { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `file_id` | 是 | `string` |
| `filename` | 否 | `string \| undefined` |
| `mount_path` | 否 | `string \| undefined` |
| `size` | 否 | `number \| undefined` |


### AttachmentsOptions

来自 `@openagentkit/sdk/files`。

```ts
import type { AttachmentsOptions } from "@openagentkit/sdk/files";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `pollIntervalMs` | 否 | `number \| undefined` |
| `scanTimeoutMs` | 否 | `number \| undefined` |


### BackendOperation

来自 `@openagentkit/sdk/providers`。

```ts
import type { BackendOperation } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `buildRequest` | 是 | `(input: Input, context: BackendRequestContext) => BackendRequestSpec \| Promise<BackendRequestSpec>` |
| `mapResponse` | 是 | `(response: Response, context: BackendRequestContext & { input: Input; }) => Output \| Promise<Output>` |


### BackendRequestContext

来自 `@openagentkit/sdk/providers`。

```ts
import type { BackendRequestContext } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `signal` | 否 | `AbortSignal \| undefined` |


### BackendRequestSpec

来自 `@openagentkit/sdk/providers`。

```ts
import type { BackendRequestSpec } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `path` | 是 | `string` |
| `init` | 否 | `Omit<RequestInit, "signal"> \| undefined` |


### BackoffOptions

来自 `@openagentkit/sdk/chat`。

```ts
import type { BackoffOptions } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `baseMs` | 否 | `number \| undefined` |
| `factor` | 否 | `number \| undefined` |
| `maxMs` | 否 | `number \| undefined` |
| `maxAttempts` | 否 | `number \| undefined` |
| `jitter` | 否 | `number \| undefined` |
| `random` | 否 | `(() => number) \| undefined` |


### ChatMessage

来自 `@openagentkit/sdk/messages`。

```ts
import type { ChatMessage } from "@openagentkit/sdk/messages";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `id` | 是 | `string` |
| `role` | 是 | `"user" \| "assistant"` |
| `parts` | 是 | `MessagePart[]` |
| `status` | 是 | `MessageStatus` |
| `threadId` | 否 | `string \| undefined` |
| `createdAt` | 否 | `string \| undefined` |
| `clientMessageId` | 否 | `string \| undefined` |


### ClientOperation

来自 `@openagentkit/sdk/providers/kit`。

```ts
export type ClientOperation = "agent" | "sendMessage" | "interrupt" | "toolApprovals" | "submitToolApproval" | "listThreads" | "listThreadEvents" | "config" | "agents" | "plaza" | "usageLimits" | "quota" | "quotaRequests" | "createQuotaRequest" | "sessions" | "sessionAgents" | "createSession" | "session" | "renameSession" | "events" | "sessionPlan" | "archiveSession" | "deleteSession" | "uploadFile" | "fileStatus" | "downloadFile" | "auth.login" | "auth.me" | "auth.logout";
```



### ClientOperations

来自 `@openagentkit/sdk/providers/kit`。

```ts
export type ClientOperations = { agent?: BackendOperation<[slug: string, signal?: AbortSignal | undefined], { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; id: string; remote_agent_id: string; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; remote_agent_version?: number | undefined; resources?: { tools: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; skills: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; mcp_servers: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; } | undefined; memory_stores?: { name: string; description?: string | undefined; }[] | undefined; }> | undefined; sendMessage?: BackendOperation<[sessionId: string, body: { text: string; skills?: string[] | undefined; attachments?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; client_message_id?: string | undefined; }], { session_id: string; accepted: boolean; event_ids: string[]; }> | undefined; interrupt?: BackendOperation<[sessionId: string], { interrupted: boolean; }> | undefined; toolApprovals?: BackendOperation<[sessionId: string], { requires_action: boolean; batch_id: string | null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string | null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string | undefined; session_thread_id?: string | undefined; status?: "pending" | "submitted" | "uncertain" | undefined; result?: "allow" | "deny" | undefined; }[]; }> | undefined; submitToolApproval?: BackendOperation<[sessionId: string, decision: { batch_id: string; call_id: string; result: "allow" | "deny"; deny_message?: string | undefined; }], { session_id: string; accepted: boolean; event_ids: string[]; }> | undefined; listThreads?: BackendOperation<[sessionId: string, query?: ThreadQueryOptions | undefined], { data: { id: string; session_id: string; parent_thread_id: string; agent: { id: string; version?: number | undefined; name?: string | undefined; }; status: string; created_at: string; updated_at: string; agent_name?: string | undefined; archived_at?: string | null | undefined; }[]; next_page_token: string | null; }> | undefined; listThreadEvents?: BackendOperation<[sessionId: string, threadId: string, query?: ThreadQueryOptions | undefined], EventsPage> | undefined; config?: BackendOperation<[signal?: AbortSignal | undefined], { apiBaseUrl: string; protocolVersion: string; gateway: "sdk" | "mock"; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; }; branding: { productName: string; logoUrl?: string | undefined; accent?: string | undefined; }; auth?: { mode: "member" | "anonymous"; passwordLogin: true; } | undefined; }> | undefined; agents?: BackendOperation<[signal?: AbortSignal | undefined], { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]> | undefined; plaza?: BackendOperation<[query?: { category?: PlazaCategory; q?: string; } | undefined, signal?: AbortSignal | undefined], { agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string | undefined; }; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" | "general" | "writing" | "coding" | "other"; name: string; count: number; }[]; }> | undefined; usageLimits?: BackendOperation<[query?: { days?: number; } | undefined, signal?: AbortSignal | undefined], { member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; }; override: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; } | null; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string | undefined; } | null> | undefined; quota?: BackendOperation<[query?: { days?: number; } | undefined, signal?: AbortSignal | undefined], { month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number | null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string | undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; } | null; }> | undefined; quotaRequests?: BackendOperation<[signal?: AbortSignal | undefined], { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }[]> | undefined; createQuotaRequest?: BackendOperation<[body: { requestedCredits: number; reason?: string; }, signal?: AbortSignal | undefined], { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }> | undefined; sessions?: BackendOperation<[query?: SessionListQuery | undefined, signal?: AbortSignal | undefined], { sessions: { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]; nextPageToken: string | null; }> | undefined; sessionAgents?: BackendOperation<[signal?: AbortSignal | undefined], string[]> | undefined; createSession?: BackendOperation<[body: { agentSlug: string; title?: string; files?: AttachmentRef[]; }, signal?: AbortSignal | undefined], { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }> | undefined; session?: BackendOperation<[id: string, signal?: AbortSignal | undefined], { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }> | undefined; renameSession?: BackendOperation<[id: string, title: string, signal?: AbortSignal | undefined], { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }> | undefined; events?: BackendOperation<[sessionId: string, query?: { afterId?: string; limit?: number; pageToken?: string; } | undefined], EventsPage> | undefined; sessionPlan?: BackendOperation<[sessionId: string, action: "archive" | "delete", signal?: AbortSignal | undefined], { plan_id: string; confirm_token: string; destructive: boolean; expires_at: number; diff: { resource: string; action: string; destructive: boolean; }[]; }> | undefined; archiveSession?: BackendOperation<[sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal | undefined], { archived: boolean; }> | undefined; deleteSession?: BackendOperation<[sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal | undefined], { deleted: boolean; }> | undefined; uploadFile?: BackendOperation<[file: { name: string; bytes: Uint8Array; mimeType?: string; }, signal?: AbortSignal | undefined], { file_id: string; filename: string; size: number; }> | undefined; fileStatus?: BackendOperation<[fileId: string, signal?: AbortSignal | undefined], { file_id: string; status: string | null; available: boolean; }> | undefined; downloadFile?: BackendOperation<[fileId: string, input?: { sessionId?: string; signal?: AbortSignal; } | undefined], Response> | undefined; "auth.login"?: BackendOperation<[body: { username: string; password: string; }, signal?: AbortSignal | undefined], { access_token: string; token_type: "Bearer"; expires_at: string; member: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; }; }> | undefined; "auth.me"?: BackendOperation<[signal?: AbortSignal | undefined], { identity: { subjectId: string; displayName?: string | undefined; tier?: string | undefined; metadata?: Record<string, unknown> | undefined; }; member?: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; } | undefined; expires_at?: string | undefined; }> | undefined; "auth.logout"?: BackendOperation<[signal?: AbortSignal | undefined], void> | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `agent` | 否 | `any` |
| `sendMessage` | 否 | `any` |
| `interrupt` | 否 | `any` |
| `toolApprovals` | 否 | `any` |
| `submitToolApproval` | 否 | `any` |
| `listThreads` | 否 | `any` |
| `listThreadEvents` | 否 | `any` |
| `config` | 否 | `any` |
| `agents` | 否 | `any` |
| `plaza` | 否 | `any` |
| `usageLimits` | 否 | `any` |
| `quota` | 否 | `any` |
| `quotaRequests` | 否 | `any` |
| `createQuotaRequest` | 否 | `any` |
| `sessions` | 否 | `any` |
| `sessionAgents` | 否 | `any` |
| `createSession` | 否 | `any` |
| `session` | 否 | `any` |
| `renameSession` | 否 | `any` |
| `events` | 否 | `any` |
| `sessionPlan` | 否 | `any` |
| `archiveSession` | 否 | `any` |
| `deleteSession` | 否 | `any` |
| `uploadFile` | 否 | `any` |
| `fileStatus` | 否 | `any` |
| `downloadFile` | 否 | `any` |
| `auth.login` | 否 | `any` |
| `auth.me` | 否 | `any` |
| `auth.logout` | 否 | `any` |


### ComposerBinding

来自 `@openagentkit/sdk/chat`。

```ts
import type { ComposerBinding } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `agentSlug` | 是 | `string \| null` |
| `sessionId` | 是 | `string \| null` |
| `files` | 是 | `{ file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[]` |
| `send` | 是 | `(text: string, options: { sessionId: string; attachments: AttachmentRef[]; skills?: string[]; }) => Promise<void>` |
| `onSessionCreated` | 否 | `((id: string) => void) \| undefined` |
| `onAccepted` | 否 | `((fileIds: string[]) => void) \| undefined` |


### ConnectionState

来自 `@openagentkit/sdk/chat`。

```ts
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
```



### DonePayload

来自 `@openagentkit/sdk/protocol`。

```ts
import type { DonePayload } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `session_id` | 是 | `string` |
| `status` | 是 | `string` |
| `last_event_id` | 是 | `string \| null` |
| `reason` | 是 | `string \| null` |
| `cursor` | 否 | `string \| null \| undefined` |


### ErrorPayload

来自 `@openagentkit/sdk/protocol`。

```ts
import type { ErrorPayload } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `code` | 是 | `string` |
| `message` | 是 | `string` |
| `retryable` | 是 | `boolean` |


### EventsPage

来自 `@openagentkit/sdk/protocol`。

```ts
import type { EventsPage } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `data` | 是 | `{ type: string; event_id?: string \| undefined; role?: string \| undefined; created_at?: string \| undefined; content?: { [x: string]: unknown; type: string; text?: string \| undefined; data?: unknown; }[] \| undefined; metadata?: Record<string, unknown> \| undefined; is_error?: boolean \| null \| undefined; code?: string \| null \| undefined; message?: string \| null \| undefined; }[]` |
| `next_page_token` | 是 | `string \| null` |


### ExplicitKitClientOptions

来自 `@openagentkit/sdk/providers/kit`。

```ts
import type { ExplicitKitClientOptions } from "@openagentkit/sdk/providers/kit";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `request` | 是 | `RequestClient` |
| `operations` | 是 | `ClientOperations` |
| `chatProvider` | 否 | `ChatProvider \| undefined` |


### FailedFile

来自 `@openagentkit/sdk/files`。

```ts
import type { FailedFile } from "@openagentkit/sdk/files";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `message` | 是 | `string` |
| `uid` | 是 | `string` |
| `name` | 是 | `string` |
| `size` | 是 | `number` |


### KitClient

来自 `@openagentkit/sdk/providers/kit`。

```ts
export type KitClient = { transport: { request: <T>(path: string, init?: RequestInit) => Promise<T>; response: (path: string, init?: RequestInit) => Promise<Response>; stream: (path: string, handlers?: StreamHandlers) => Promise<void>; url: (path: string) => string; }; auth: { login: (body: MemberLoginRequest, signal?: AbortSignal) => Promise<{ access_token: string; token_type: "Bearer"; expires_at: string; member: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; }; }>; me: (signal?: AbortSignal) => Promise<{ identity: { subjectId: string; displayName?: string | undefined; tier?: string | undefined; metadata?: Record<string, unknown> | undefined; }; member?: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; } | undefined; expires_at?: string | undefined; }>; logout: (signal?: AbortSignal) => Promise<void>; }; config: (signal?: AbortSignal) => Promise<{ apiBaseUrl: string; protocolVersion: string; gateway: "sdk" | "mock"; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; }; branding: { productName: string; logoUrl?: string | undefined; accent?: string | undefined; }; auth?: { mode: "member" | "anonymous"; passwordLogin: true; } | undefined; }>; agents: (signal?: AbortSignal) => Promise<{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]>; plaza: (query?: { category?: PlazaCategory; q?: string; }, signal?: AbortSignal) => Promise<{ agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string | undefined; }; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" | "general" | "writing" | "coding" | "other"; name: string; count: number; }[]; }>; usageLimits: (query?: { days?: number; }, signal?: AbortSignal) => Promise<{ member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; }; override: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; } | null; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string | undefined; } | null>; quota: (query?: { days?: number; }, signal?: AbortSignal) => Promise<{ month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number | null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string | undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; } | null; }>; quotaRequests: (signal?: AbortSignal) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }[]>; createQuotaRequest: (body: { requestedCredits: number; reason?: string; }, signal?: AbortSignal) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }>; agent: (slug: string, signal?: AbortSignal) => Promise<{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; id: string; remote_agent_id: string; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; remote_agent_version?: number | undefined; resources?: { tools: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; skills: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; mcp_servers: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; } | undefined; memory_stores?: { name: string; description?: string | undefined; }[] | undefined; }>; sessions: (query?: SessionListQuery, signal?: AbortSignal) => Promise<{ sessions: { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]; nextPageToken: string | null; }>; sessionAgents: (signal?: AbortSignal) => Promise<string[]>; sessionDirectory: (signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]>; createSession: (body: { agentSlug: string; title?: string; files?: AttachmentRef[]; }, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }>; session: (id: string, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }>; renameSession: (id: string, title: string, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }>; sendMessage: (sessionId: string, body: SendMessageRequest) => Promise<{ session_id: string; accepted: boolean; event_ids: string[]; }>; toolApprovals: (sessionId: string) => Promise<{ requires_action: boolean; batch_id: string | null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string | null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string | undefined; session_thread_id?: string | undefined; status?: "pending" | "submitted" | "uncertain" | undefined; result?: "allow" | "deny" | undefined; }[]; }>; submitToolApproval: (sessionId: string, decision: ToolApprovalDecision) => Promise<{ session_id: string; accepted: boolean; event_ids: string[]; }>; interrupt: (sessionId: string) => Promise<{ interrupted: boolean; }>; events: (sessionId: string, query?: { afterId?: string; limit?: number; pageToken?: string; }) => Promise<EventsPage>; listThreads: (sessionId: string, query?: ThreadQueryOptions) => Promise<SessionThreadsResponse>; listThreadEvents: (sessionId: string, threadId: string, query?: ThreadQueryOptions) => Promise<EventsPage>; stream: (sessionId: string, streamOptions?: StreamSessionOptions) => Promise<void>; sessionPlan: (sessionId: string, action: "archive" | "delete", signal?: AbortSignal) => Promise<{ plan_id: string; confirm_token: string; destructive: boolean; expires_at: number; diff: { resource: string; action: string; destructive: boolean; }[]; }>; archiveSession: (sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal) => Promise<{ archived: boolean; }>; deleteSession: (sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal) => Promise<{ deleted: boolean; }>; uploadFile: (file: { name: string; bytes: Uint8Array; mimeType?: string; }, signal?: AbortSignal) => Promise<{ file_id: string; filename: string; size: number; }>; fileDownloadUrl: (fileId: string) => string; fileStatus: (fileId: string, signal?: AbortSignal) => Promise<{ file_id: string; status: string | null; available: boolean; }>; downloadFile: (fileId: string, input?: { sessionId?: string; signal?: AbortSignal; }) => Promise<Response>; } & { supports(operation: ClientOperation): boolean; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `transport` | 是 | `{ request: <T>(path: string, init?: RequestInit) => Promise<T>; response: (path: string, init?: RequestInit) => Promise<Response>; stream: (path: string, handlers?: StreamHandlers) => Promise<void>; url: (path: string) => string; }` |
| `auth` | 是 | `{ login: (body: MemberLoginRequest, signal?: AbortSignal) => Promise<{ access_token: string; token_type: "Bearer"; expires_at: string; member: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number \| null; covered_sessions: number; }; output_tokens: { value: number \| null; covered_sessions: number; }; cache_read_input_tokens: { value: number \| null; covered_sessions: number; }; cache_creation_input_tokens: { value: number \| null; covered_sessions: number; }; active_seconds: { value: number \| null; covered_sessions: number; }; duration_seconds: { value: number \| null; covered_sessions: number; }; }; agents: { slug: string; display_name: string \| null; catalog_entry_id?: string \| null \| undefined; deleted?: boolean \| undefined; }[]; refresh_status: "idle" \| "refreshing" \| "partial" \| "failed"; completed_sessions: number; refreshed_at?: string \| undefined; } \| undefined; email?: string \| undefined; }; }>; me: (signal?: AbortSignal) => Promise<{ identity: { subjectId: string; displayName?: string \| undefined; tier?: string \| undefined; metadata?: Record<string, unknown> \| undefined; }; member?: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number \| null; covered_sessions: number; }; output_tokens: { value: number \| null; covered_sessions: number; }; cache_read_input_tokens: { value: number \| null; covered_sessions: number; }; cache_creation_input_tokens: { value: number \| null; covered_sessions: number; }; active_seconds: { value: number \| null; covered_sessions: number; }; duration_seconds: { value: number \| null; covered_sessions: number; }; }; agents: { slug: string; display_name: string \| null; catalog_entry_id?: string \| null \| undefined; deleted?: boolean \| undefined; }[]; refresh_status: "idle" \| "refreshing" \| "partial" \| "failed"; completed_sessions: number; refreshed_at?: string \| undefined; } \| undefined; email?: string \| undefined; } \| undefined; expires_at?: string \| undefined; }>; logout: (signal?: AbortSignal) => Promise<void>; }` |
| `config` | 是 | `(signal?: AbortSignal) => Promise<{ apiBaseUrl: string; protocolVersion: string; gateway: "sdk" \| "mock"; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; }; branding: { productName: string; logoUrl?: string \| undefined; accent?: string \| undefined; }; auth?: { mode: "member" \| "anonymous"; passwordLogin: true; } \| undefined; }>` |
| `agents` | 是 | `(signal?: AbortSignal) => Promise<{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; }[]>` |
| `plaza` | 是 | `(query?: { category?: PlazaCategory; q?: string; }, signal?: AbortSignal) => Promise<{ agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string \| undefined; }; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" \| "general" \| "writing" \| "coding" \| "other"; name: string; count: number; }[]; }>` |
| `usageLimits` | 是 | `(query?: { days?: number; }, signal?: AbortSignal) => Promise<{ member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number \| null; monthly_active_seconds: number \| null; daily_tokens: number \| null; daily_active_seconds: number \| null; }; override: { monthly_tokens: number \| null; monthly_active_seconds: number \| null; daily_tokens: number \| null; daily_active_seconds: number \| null; } \| null; tokens: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; active_seconds: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; active_seconds: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string \| undefined; } \| null>` |
| `quota` | 是 | `(query?: { days?: number; }, signal?: AbortSignal) => Promise<{ month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number \| null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string \| undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" \| "approved" \| "rejected"; mode: "override" \| "pack" \| null; granted_credits: number \| null; created_at: string; reason?: string \| undefined; review_note?: string \| undefined; reviewed_by?: string \| undefined; reviewed_at?: string \| undefined; } \| null; }>` |
| `quotaRequests` | 是 | `(signal?: AbortSignal) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" \| "approved" \| "rejected"; mode: "override" \| "pack" \| null; granted_credits: number \| null; created_at: string; reason?: string \| undefined; review_note?: string \| undefined; reviewed_by?: string \| undefined; reviewed_at?: string \| undefined; }[]>` |
| `createQuotaRequest` | 是 | `(body: { requestedCredits: number; reason?: string; }, signal?: AbortSignal) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" \| "approved" \| "rejected"; mode: "override" \| "pack" \| null; granted_credits: number \| null; created_at: string; reason?: string \| undefined; review_note?: string \| undefined; reviewed_by?: string \| undefined; reviewed_at?: string \| undefined; }>` |
| `agent` | 是 | `(slug: string, signal?: AbortSignal) => Promise<{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; id: string; remote_agent_id: string; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; remote_agent_version?: number \| undefined; resources?: { tools: { name: string; description?: string \| undefined; permission?: "allow" \| "ask" \| undefined; }[]; skills: { name: string; description?: string \| undefined; permission?: "allow" \| "ask" \| undefined; }[]; mcp_servers: { name: string; description?: string \| undefined; permission?: "allow" \| "ask" \| undefined; }[]; } \| undefined; memory_stores?: { name: string; description?: string \| undefined; }[] \| undefined; }>` |
| `sessions` | 是 | `(query?: SessionListQuery, signal?: AbortSignal) => Promise<{ sessions: { session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; }[]; nextPageToken: string \| null; }>` |
| `sessionAgents` | 是 | `(signal?: AbortSignal) => Promise<string[]>` |
| `sessionDirectory` | 是 | `(signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; }[]>` |
| `createSession` | 是 | `(body: { agentSlug: string; title?: string; files?: AttachmentRef[]; }, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; usage?: { input_tokens?: number \| undefined; output_tokens?: number \| undefined; cache_read_input_tokens?: number \| undefined; cache_creation_input_tokens?: number \| undefined; } \| undefined; stats?: { active_seconds?: number \| undefined; duration_seconds?: number \| undefined; } \| undefined; remote_status?: string \| undefined; files?: { file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[] \| undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[]; }[] \| undefined; }>` |
| `session` | 是 | `(id: string, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; usage?: { input_tokens?: number \| undefined; output_tokens?: number \| undefined; cache_read_input_tokens?: number \| undefined; cache_creation_input_tokens?: number \| undefined; } \| undefined; stats?: { active_seconds?: number \| undefined; duration_seconds?: number \| undefined; } \| undefined; remote_status?: string \| undefined; files?: { file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[] \| undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[]; }[] \| undefined; }>` |
| `renameSession` | 是 | `(id: string, title: string, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; usage?: { input_tokens?: number \| undefined; output_tokens?: number \| undefined; cache_read_input_tokens?: number \| undefined; cache_creation_input_tokens?: number \| undefined; } \| undefined; stats?: { active_seconds?: number \| undefined; duration_seconds?: number \| undefined; } \| undefined; remote_status?: string \| undefined; files?: { file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[] \| undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[]; }[] \| undefined; }>` |
| `sendMessage` | 是 | `(sessionId: string, body: SendMessageRequest) => Promise<{ session_id: string; accepted: boolean; event_ids: string[]; }>` |
| `toolApprovals` | 是 | `(sessionId: string) => Promise<{ requires_action: boolean; batch_id: string \| null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string \| null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string \| undefined; session_thread_id?: string \| undefined; status?: "pending" \| "submitted" \| "uncertain" \| undefined; result?: "allow" \| "deny" \| undefined; }[]; }>` |
| `submitToolApproval` | 是 | `(sessionId: string, decision: ToolApprovalDecision) => Promise<{ session_id: string; accepted: boolean; event_ids: string[]; }>` |
| `interrupt` | 是 | `(sessionId: string) => Promise<{ interrupted: boolean; }>` |
| `events` | 是 | `(sessionId: string, query?: { afterId?: string; limit?: number; pageToken?: string; }) => Promise<EventsPage>` |
| `listThreads` | 是 | `(sessionId: string, query?: ThreadQueryOptions) => Promise<SessionThreadsResponse>` |
| `listThreadEvents` | 是 | `(sessionId: string, threadId: string, query?: ThreadQueryOptions) => Promise<EventsPage>` |
| `stream` | 是 | `(sessionId: string, streamOptions?: StreamSessionOptions) => Promise<void>` |
| `sessionPlan` | 是 | `(sessionId: string, action: "archive" \| "delete", signal?: AbortSignal) => Promise<{ plan_id: string; confirm_token: string; destructive: boolean; expires_at: number; diff: { resource: string; action: string; destructive: boolean; }[]; }>` |
| `archiveSession` | 是 | `(sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal) => Promise<{ archived: boolean; }>` |
| `deleteSession` | 是 | `(sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal) => Promise<{ deleted: boolean; }>` |
| `uploadFile` | 是 | `(file: { name: string; bytes: Uint8Array; mimeType?: string; }, signal?: AbortSignal) => Promise<{ file_id: string; filename: string; size: number; }>` |
| `fileDownloadUrl` | 是 | `(fileId: string) => string` |
| `fileStatus` | 是 | `(fileId: string, signal?: AbortSignal) => Promise<{ file_id: string; status: string \| null; available: boolean; }>` |
| `downloadFile` | 是 | `(fileId: string, input?: { sessionId?: string; signal?: AbortSignal; }) => Promise<Response>` |
| `supports` | 是 | `(operation: ClientOperation) => boolean` |


### KitClientOptions

来自 `@openagentkit/sdk/providers/kit`。

```ts
export type KitClientOptions = LegacyKitClientOptions | ExplicitKitClientOptions;
```



### MemberLoginRequest

来自 `@openagentkit/sdk/protocol`。

```ts
export type MemberLoginRequest = { username: string; password: string; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `username` | 是 | `string` |
| `password` | 是 | `string` |


### MemberUsageLimitView

来自 `@openagentkit/sdk/protocol`。

```ts
export type MemberUsageLimitView = { member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; }; override: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; } | null; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `member_id` | 是 | `string` |
| `month` | 是 | `string` |
| `reset_at` | 是 | `string` |
| `limits` | 是 | `{ monthly_tokens: number \| null; monthly_active_seconds: number \| null; daily_tokens: number \| null; daily_active_seconds: number \| null; }` |
| `override` | 是 | `{ monthly_tokens: number \| null; monthly_active_seconds: number \| null; daily_tokens: number \| null; daily_active_seconds: number \| null; } \| null` |
| `tokens` | 是 | `{ limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }` |
| `active_seconds` | 是 | `{ limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }` |
| `day_state` | 是 | `{ day: string; reset_at: string; tokens: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; active_seconds: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; }` |
| `accounting_started_at` | 是 | `string` |
| `daily` | 是 | `{ day: string; tokens: number; active_seconds: number; }[]` |
| `refreshed_at` | 否 | `string \| undefined` |


### MemberView

来自 `@openagentkit/sdk/protocol`。

```ts
export type MemberView = { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `member_id` | 是 | `string` |
| `username` | 是 | `string` |
| `display_name` | 是 | `string` |
| `auth_type` | 是 | `"local"` |
| `status` | 是 | `"active"` |
| `created_at` | 是 | `string` |
| `updated_at` | 是 | `string` |
| `usage_summary` | 否 | `{ session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number \| null; covered_sessions: number; }; output_tokens: { value: number \| null; covered_sessions: number; }; cache_read_input_tokens: { value: number \| null; covered_sessions: number; }; cache_creation_input_tokens: { value: number \| null; covered_sessions: number; }; active_seconds: { value: number \| null; covered_sessions: number; }; duration_seconds: { value: number \| null; covered_sessions: number; }; }; agents: { slug: string; display_name: string \| null; catalog_entry_id?: string \| null \| undefined; deleted?: boolean \| undefined; }[]; refresh_status: "idle" \| "refreshing" \| "partial" \| "failed"; completed_sessions: number; refreshed_at?: string \| undefined; } \| undefined` |
| `email` | 否 | `string \| undefined` |


### MessageFileAssociation

来自 `@openagentkit/sdk/protocol`。

```ts
export type MessageFileAssociation = { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `event_ids` | 是 | `string[]` |
| `files` | 是 | `{ file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[]` |


### MessagePart

来自 `@openagentkit/sdk/messages`。

```ts
export type MessagePart = ({ type: "text"; text: string; } | { type: "reasoning"; text: string; status?: "streaming" | "done" | "failed" | "interrupted"; startedAt?: string; } | { type: "tool"; toolId: string; name: string; status: "running" | "done" | "error"; input?: unknown; output?: unknown; startedAt?: string; endedAt?: string; } | { type: "artifact"; artifact: ArtifactDescriptor; } | { type: "attachment"; file: AttachmentRef; } | { type: "status"; text: string; } | { type: "sub-agent"; threadId: string; } | { type: "unknown"; label: string; value: unknown; }) & { id?: string; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `type` | 是 | `"unknown" \| "text" \| "status" \| "reasoning" \| "tool" \| "artifact" \| "attachment" \| "sub-agent"` |
| `id` | 否 | `string \| undefined` |


### MessageStatus

来自 `@openagentkit/sdk/messages`。

```ts
export type MessageStatus = "pending" | "streaming" | "failed" | "done" | "interrupted";
```



### MessageTransformer

来自 `@openagentkit/sdk/messages`。

```ts
export type MessageTransformer = (input: MessageTransformInput) => MessageTransformResult;
```



### MessageTransformInput

来自 `@openagentkit/sdk/messages`。

```ts
import type { MessageTransformInput } from "@openagentkit/sdk/messages";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `messages` | 是 | `ChatMessage[]` |
| `event` | 是 | `{ type: string; event_id?: string \| undefined; role?: string \| undefined; created_at?: string \| undefined; content?: { [x: string]: unknown; type: string; text?: string \| undefined; data?: unknown; }[] \| undefined; metadata?: Record<string, unknown> \| undefined; is_error?: boolean \| null \| undefined; code?: string \| null \| undefined; message?: string \| null \| undefined; }` |
| `identity` | 是 | `string` |


### MessageTransformResult

来自 `@openagentkit/sdk/messages`。

```ts
import type { MessageTransformResult } from "@openagentkit/sdk/messages";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `messages` | 是 | `ChatMessage[]` |
| `artifacts` | 否 | `ArtifactDescriptor[] \| undefined` |


### OperationProgress

来自 `@openagentkit/sdk/protocol`。

```ts
import type { OperationProgress } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `operation_id` | 是 | `string` |
| `phase` | 是 | `string` |
| `progress` | 是 | `number` |
| `message` | 否 | `string \| undefined` |


### PendingFile

来自 `@openagentkit/sdk/files`。

```ts
import type { PendingFile } from "@openagentkit/sdk/files";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `uid` | 是 | `string` |
| `name` | 是 | `string` |
| `size` | 是 | `number` |


### PendingSessionAction

来自 `@openagentkit/sdk/sessions`。

```ts
import type { PendingSessionAction } from "@openagentkit/sdk/sessions";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sessionId` | 是 | `string` |
| `action` | 是 | `SessionAction` |
| `plan` | 否 | `{ plan_id: string; confirm_token: string; destructive: boolean; expires_at: number; diff: { resource: string; action: string; destructive: boolean; }[]; } \| undefined` |
| `error` | 否 | `string \| undefined` |


### PingPayload

来自 `@openagentkit/sdk/protocol`。

```ts
import type { PingPayload } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `t` | 是 | `number` |


### PlazaCategory

来自 `@openagentkit/sdk/protocol`。

```ts
export type PlazaCategory = "data" | "general" | "writing" | "coding" | "other";
```



### QuotaExceededDetails

来自 `@openagentkit/sdk/usage`。

```ts
import type { QuotaExceededDetails } from "@openagentkit/sdk/usage";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `month` | 是 | `string` |
| `limit` | 是 | `number` |
| `used` | 是 | `number` |
| `remaining` | 是 | `number` |
| `reset_at` | 是 | `string` |
| `metric` | 否 | `"tokens" \| "active_seconds" \| undefined` |
| `period` | 否 | `"month" \| "day" \| undefined` |
| `day` | 否 | `string \| undefined` |


### RawSseMessage

来自 `@openagentkit/sdk/stream`。

```ts
import type { RawSseMessage } from "@openagentkit/sdk/stream";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `event` | 是 | `string` |
| `data` | 是 | `string` |
| `id` | 否 | `string \| undefined` |


### ReadyPayload

来自 `@openagentkit/sdk/protocol`。

```ts
import type { ReadyPayload } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `session_id` | 是 | `string` |
| `after` | 是 | `string \| null` |
| `replayed` | 是 | `number` |
| `cursor` | 否 | `string \| null \| undefined` |


### RequestClient

来自 `@openagentkit/sdk/request`。

```ts
import type { RequestClient } from "@openagentkit/sdk/request";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `url` | 是 | `(path: string) => string` |
| `response` | 是 | `(path: string, init?: RequestInit) => Promise<Response>` |
| `json` | 是 | `<T>(path: string, init?: RequestInit) => Promise<T>` |
| `stream` | 是 | `(path: string, init?: RequestInit, options?: SseStreamOptions) => AsyncGenerator<RawSseMessage, void, unknown>` |


### SendMessageRequest

来自 `@openagentkit/sdk/protocol`。

```ts
export type SendMessageRequest = { text: string; skills?: string[] | undefined; attachments?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; client_message_id?: string | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `text` | 是 | `string` |
| `skills` | 否 | `string[] \| undefined` |
| `attachments` | 否 | `{ file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[] \| undefined` |
| `client_message_id` | 否 | `string \| undefined` |


### SendMessageResponse

来自 `@openagentkit/sdk/protocol`。

```ts
export type SendMessageResponse = { session_id: string; accepted: boolean; event_ids: string[]; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `session_id` | 是 | `string` |
| `accepted` | 是 | `boolean` |
| `event_ids` | 是 | `string[]` |


### SessionAction

来自 `@openagentkit/sdk/sessions`。

```ts
export type SessionAction = "archive" | "delete";
```



### SessionEvent

来自 `@openagentkit/sdk/protocol`。

```ts
export type SessionEvent = { type: string; event_id?: string | undefined; role?: string | undefined; created_at?: string | undefined; content?: { [x: string]: unknown; type: string; text?: string | undefined; data?: unknown; }[] | undefined; metadata?: Record<string, unknown> | undefined; is_error?: boolean | null | undefined; code?: string | null | undefined; message?: string | null | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `type` | 是 | `string` |
| `event_id` | 否 | `string \| undefined` |
| `role` | 否 | `string \| undefined` |
| `created_at` | 否 | `string \| undefined` |
| `content` | 否 | `{ [x: string]: unknown; type: string; text?: string \| undefined; data?: unknown; }[] \| undefined` |
| `metadata` | 否 | `Record<string, unknown> \| undefined` |
| `is_error` | 否 | `boolean \| null \| undefined` |
| `code` | 否 | `string \| null \| undefined` |
| `message` | 否 | `string \| null \| undefined` |


### SessionListQuery

来自 `@openagentkit/sdk/sessions`。

```ts
import type { SessionListQuery } from "@openagentkit/sdk/sessions";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `agentSlug` | 否 | `string \| undefined` |
| `activeEntryOnly` | 否 | `boolean \| undefined` |
| `limit` | 否 | `number \| undefined` |
| `pageToken` | 否 | `string \| undefined` |
| `includeArchived` | 否 | `boolean \| undefined` |
| `q` | 否 | `string \| undefined` |


### SessionSnapshot

来自 `@openagentkit/sdk/chat`。

```ts
import type { SessionSnapshot } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sessionId` | 是 | `string \| null` |
| `providerStatus` | 是 | `string \| null` |
| `turnRunning` | 是 | `boolean` |
| `phase` | 是 | `TurnPhase` |
| `connection` | 是 | `ConnectionState` |
| `canSend` | 是 | `boolean` |
| `messages` | 是 | `ChatMessage[]` |
| `threads` | 是 | `Record<string, ChatMessage[]>` |
| `artifacts` | 是 | `ArtifactDescriptor[]` |
| `approvals` | 是 | `ChatToolApproval[]` |
| `lastEventId` | 是 | `string \| null` |
| `lastCursor` | 是 | `string \| null` |
| `streamError` | 是 | `{ code: string; message: string; } \| null` |


### SessionStore

来自 `@openagentkit/sdk/chat`。

```ts
import type { SessionStore } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `subscribe` | 是 | `(listener: () => void) => () => void` |
| `getSnapshot` | 是 | `() => SessionSnapshot` |
| `reset` | 是 | `(sessionId: string \| null) => void` |
| `beginTurn` | 是 | `(input: { text: string; clientMessageId?: string; attachments?: AttachmentRef[]; }) => { messageId: string; generation: number; }` |
| `setMessageFiles` | 是 | `(entries: MessageFileAssociation[]) => void` |
| `acknowledgePending` | 是 | `(messageId: string, eventIds: string[], generation: number) => void` |
| `setPendingStatus` | 是 | `(messageId: string, status: MessageStatus, generation: number) => void` |
| `applyEvent` | 是 | `(event: SessionEvent, cursor?: string) => "applied" \| "duplicate"` |
| `beginReplay` | 是 | `() => void` |
| `finishReplay` | 是 | `(cursor?: string \| null) => void` |
| `setConnection` | 是 | `(connection: ConnectionState) => void` |
| `setApprovals` | 是 | `(response: ToolApprovalsResponse) => void` |
| `setApprovalStatus` | 是 | `(batchId: string, callId: string, status: ChatToolApproval["status"]) => void` |
| `markStopping` | 是 | `() => void` |
| `clearStopping` | 是 | `() => void` |
| `onStreamDone` | 是 | `() => void` |
| `onStreamError` | 是 | `(error: { code: string; message: string; }) => void` |
| `clearStreamError` | 是 | `() => void` |
| `notify` | 是 | `() => void` |
| `generation` | 是 | `() => number` |


### SessionSummary

来自 `@openagentkit/sdk/protocol`。

```ts
export type SessionSummary = { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `session_id` | 是 | `string` |
| `agent_slug` | 是 | `string` |
| `created_at` | 是 | `string` |
| `title` | 否 | `string \| undefined` |
| `status` | 否 | `string \| undefined` |
| `last_event_at` | 否 | `string \| undefined` |


### SessionThreadsResponse

来自 `@openagentkit/sdk/protocol`。

```ts
export type SessionThreadsResponse = { data: { id: string; session_id: string; parent_thread_id: string; agent: { id: string; version?: number | undefined; name?: string | undefined; }; status: string; created_at: string; updated_at: string; agent_name?: string | undefined; archived_at?: string | null | undefined; }[]; next_page_token: string | null; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `data` | 是 | `{ id: string; session_id: string; parent_thread_id: string; agent: { id: string; version?: number \| undefined; name?: string \| undefined; }; status: string; created_at: string; updated_at: string; agent_name?: string \| undefined; archived_at?: string \| null \| undefined; }[]` |
| `next_page_token` | 是 | `string \| null` |


### SseFrame

来自 `@openagentkit/sdk/protocol`。

```ts
export type SseFrame = { type: "reset"; data: { session_id: string; }; } | { type: "ready"; data: ReadyPayload; } | { type: "event"; data: SessionEvent; cursor?: string; } | { type: "done"; data: DonePayload; } | { type: "error"; data: ErrorPayload; } | { type: "ping"; data: PingPayload; } | { type: "operation"; data: OperationProgress; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `type` | 是 | `"error" \| "done" \| "reset" \| "ready" \| "event" \| "ping" \| "operation"` |
| `data` | 是 | `{ type: string; event_id?: string \| undefined; role?: string \| undefined; created_at?: string \| undefined; content?: { [x: string]: unknown; type: string; text?: string \| undefined; data?: unknown; }[] \| undefined; metadata?: Record<string, unknown> \| undefined; is_error?: boolean \| null \| undefined; code?: string \| null \| undefined; message?: string \| null \| undefined; } \| { session_id: string; } \| ReadyPayload \| DonePayload \| ErrorPayload \| PingPayload \| OperationProgress` |


### SseStreamOptions

来自 `@openagentkit/sdk/stream`。

```ts
import type { SseStreamOptions } from "@openagentkit/sdk/stream";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `signal` | 否 | `AbortSignal \| undefined` |
| `utf8Fatal` | 否 | `boolean \| undefined` |
| `flushOnEnd` | 否 | `boolean \| undefined` |
| `onComment` | 否 | `(() => void) \| undefined` |
| `maxFrameChars` | 否 | `number \| undefined` |


### StagedFile

来自 `@openagentkit/sdk/files`。

```ts
import type { StagedFile } from "@openagentkit/sdk/files";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `file_id` | 是 | `string` |
| `filename` | 是 | `string` |
| `size` | 是 | `number` |
| `available` | 是 | `boolean` |
| `timedOut` | 否 | `boolean \| undefined` |


### StreamHandlers

来自 `@openagentkit/sdk/providers/kit`。

```ts
import type { StreamHandlers } from "@openagentkit/sdk/providers/kit";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `onFrame` | 否 | `((frame: SseFrame) => void) \| undefined` |
| `signal` | 否 | `AbortSignal \| undefined` |
| `init` | 否 | `Omit<RequestInit, "signal"> \| undefined` |
| `idleTimeoutMs` | 否 | `number \| undefined` |


### StreamSessionOptions

来自 `@openagentkit/sdk/providers`。

```ts
import type { StreamSessionOptions } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `after` | 否 | `string \| null \| undefined` |
| `signal` | 否 | `AbortSignal \| undefined` |
| `onEvent` | 否 | `((event: SessionEvent, cursor?: string) => void) \| undefined` |
| `onReset` | 否 | `(() => void) \| undefined` |
| `onReady` | 否 | `((info: { sessionId: string; replayed: number; cursor?: string \| null; }) => void) \| undefined` |
| `onDone` | 否 | `((info: { status: string; lastEventId: string \| null; }) => void) \| undefined` |
| `onPing` | 否 | `((t: number) => void) \| undefined` |


### ThreadQueryOptions

来自 `@openagentkit/sdk/providers`。

```ts
import type { ThreadQueryOptions } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `limit` | 否 | `number \| undefined` |
| `pageToken` | 否 | `string \| undefined` |
| `signal` | 否 | `AbortSignal \| undefined` |


### ToolApprovalsResponse

来自 `@openagentkit/sdk/protocol`。

```ts
export type ToolApprovalsResponse = { requires_action: boolean; batch_id: string | null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string | null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string | undefined; session_thread_id?: string | undefined; status?: "pending" | "submitted" | "uncertain" | undefined; result?: "allow" | "deny" | undefined; }[]; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `requires_action` | 是 | `boolean` |
| `batch_id` | 是 | `string \| null` |
| `pending_call_ids` | 是 | `string[]` |
| `requests` | 是 | `{ batch_id: string; call_id: string; request_event_id: string \| null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string \| undefined; session_thread_id?: string \| undefined; status?: "pending" \| "submitted" \| "uncertain" \| undefined; result?: "allow" \| "deny" \| undefined; }[]` |


### TurnPhase

来自 `@openagentkit/sdk/chat`。

```ts
export type TurnPhase = "requires_action" | "idle" | "failed" | "interrupted" | "running" | "stopping";
```



### UploadSource

来自 `@openagentkit/sdk/files`。

```ts
import type { UploadSource } from "@openagentkit/sdk/files";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `name` | 是 | `string` |
| `size` | 是 | `number` |
| `type` | 否 | `string \| undefined` |
| `arrayBuffer` | 是 | `() => Promise<ArrayBuffer>` |
