# API 参考

本页由 `pnpm gen:skills` 生成。更新公开 TypeScript 声明或中文 catalog 后重新生成。
字段类型和必填性来自公开 API，行为说明依据所列文档整理。
组件表格列出 Kit 自有属性。组件按声明继承标准的 React/DOM 属性。
参考中的包名用于仓库内导入。业务项目按[复制组件和 Kit SDK](copy-in.md)改用本地源码入口。

## 目录

- [createSessionEventChatProvider](#createsessioneventchatprovider)
- [SessionEventChatProviderOptions](#sessioneventchatprovideroptions)
- [SessionEventStreamOperation](#sessioneventstreamoperation)
- [BackendOperation](#backendoperation)
- [BackendRequestContext](#backendrequestcontext)
- [BackendRequestSpec](#backendrequestspec)
- [createSseStream](#createssestream)
- [SseStreamOptions](#ssestreamoptions)
- [SseStreamError](#ssestreamerror)
- [createRequest](#createrequest)
- [RequestClient](#requestclient)
- [RequestOptions](#requestoptions)
- [ChatProvider](#chatprovider)
- [ChatProvider.stream](#chatproviderstream)
- [ChatProvider.listEvents](#chatproviderlistevents)
- [ChatProvider.sendMessage](#chatprovidersendmessage)
- [ChatProvider.interrupt](#chatproviderinterrupt)
- [ChatProvider.toolApprovals](#chatprovidertoolapprovals)
- [ChatProvider.submitToolApproval](#chatprovidersubmittoolapproval)
- [ChatProvider.transformMessage](#chatprovidertransformmessage)
- [transformSessionEvent](#transformsessionevent)
- [MessageTransformer](#messagetransformer)
- [MessageTransformInput](#messagetransforminput)
- [MessageTransformResult](#messagetransformresult)
- [createKitChatProvider](#createkitchatprovider)
- [StreamSessionOptions](#streamsessionoptions)
- [createBailianChatProvider](#createbailianchatprovider)
- [BailianChatProviderOptions](#bailianchatprovideroptions)
- [openStream](#openstream)
- [listEvents](#listevents)
- [BailianStreamResponse](#bailianstreamresponse)
- [BailianEventsPage](#bailianeventspage)
- [SessionEvent](#sessionevent)
- [SendMessageRequest](#sendmessagerequest)
- [SendMessageResponse](#sendmessageresponse)
- [ToolApprovalsResponse](#toolapprovalsresponse)
- [ToolApprovalDecision](#toolapprovaldecision)
- [KitError](#kiterror)
- [BailianOperation](#bailianoperation)
- [BailianRequestSpec](#bailianrequestspec)
- [BailianRequestContext](#bailianrequestcontext)
- [createBailianThreadOperations](#createbailianthreadoperations)
- [BailianThreadOperations](#bailianthreadoperations)
- [BailianThreadQuery](#bailianthreadquery)
- [ThreadQueryOptions](#threadqueryoptions)
- [ChatProvider.listThreads](#chatproviderlistthreads)
- [ChatProvider.listThreadEvents](#chatproviderlistthreadevents)
- [ClientOperations](#clientoperations)
- [ClientOperation](#clientoperation)
- [ExplicitKitClientOptions](#explicitkitclientoptions)
- [createMemberSessionStorage](#createmembersessionstorage)
- [normalizeMemberApiBaseUrl](#normalizememberapibaseurl)
- [streamProtocolFrames](#streamprotocolframes)
- [相关类型](#相关类型)

## createSessionEventChatProvider

通过可配置的历史分页和实时订阅接入标准 SessionEvent 后端。

从 `@openagentkit/sdk/providers/session-events` 导入 `createSessionEventChatProvider`。
公开入口为 `packages/sdk/src/providers/session-events/index.ts`，声明位于 `packages/sdk/src/providers/session-events/provider.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/normalized-provider.ts)

- Web 应用和自建后端共用这个公开工厂。路径、身份请求头和 JSON 包装由应用配置。
- 接收 reset、ready、event、ping、done、error 帧。百炼原始增量流使用专用工厂。
- connectTimeoutMs 默认 30000，idleTimeoutMs 默认 45000。意外 EOF 可重试。
- 协议版本头通过请求配置显式传入。禁止自动重试写请求。

```ts
export function createSessionEventChatProvider(options: SessionEventChatProviderOptions): ChatProvider & Required<Pick<ChatProvider, "listEvents">>;
```


<!-- source-sha256: 4bb2596eaf0c93fa5f93da6b7dec03c6a7011567a2c2f838e01952161de78d5d; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## SessionEventChatProviderOptions

注入 RequestClient，配置必填 listEvents、实时订阅、四个业务操作及可选线程查询。

从 `@openagentkit/sdk/providers/session-events` 导入 `SessionEventChatProviderOptions`。
公开入口为 `packages/sdk/src/providers/session-events/index.ts`，声明位于 `packages/sdk/src/providers/session-events/provider.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/normalized-provider.ts)


```ts
import type { SessionEventChatProviderOptions } from "@openagentkit/sdk/providers/session-events";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `request` | 是 | `RequestClient` |
| `listEvents` | 是 | `BackendOperation<{ sessionId: string; } & Omit<EventQueryOptions, "signal">, EventsPage>` |
| `stream` | 是 | `SessionEventStreamOperation` |
| `sendMessage` | 是 | `BackendOperation<{ sessionId: string; body: SendMessageRequest; }, { session_id: string; accepted: boolean; event_ids: string[]; }>` |
| `interrupt` | 是 | `BackendOperation<{ sessionId: string; }, { interrupted: boolean; }>` |
| `toolApprovals` | 是 | `BackendOperation<{ sessionId: string; }, { requires_action: boolean; batch_id: string \| null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string \| null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string \| undefined; session_thread_id?: string \| undefined; status?: "pending" \| "submitted" \| "uncertain" \| undefined; result?: "allow" \| "deny" \| undefined; }[]; }>` |
| `submitToolApproval` | 是 | `BackendOperation<{ sessionId: string; decision: ToolApprovalDecision; }, { session_id: string; accepted: boolean; event_ids: string[]; }>` |
| `listThreads` | 否 | `BackendOperation<{ sessionId: string; } & ThreadQueryOptions, { data: { id: string; session_id: string; parent_thread_id: string; agent: { id: string; version?: number \| undefined; name?: string \| undefined; }; status: string; created_at: string; updated_at: string; agent_name?: string \| undefined; archived_at?: string \| null \| undefined; }[]; next_page_token: string \| null; }> \| undefined` |
| `listThreadEvents` | 否 | `BackendOperation<{ sessionId: string; threadId: string; } & ThreadQueryOptions, EventsPage> \| undefined` |
| `transformMessage` | 否 | `MessageTransformer \| undefined` |
| `connectTimeoutMs` | 否 | `number \| undefined` |
| `idleTimeoutMs` | 否 | `number \| undefined` |

<!-- source-sha256: 4bb2596eaf0c93fa5f93da6b7dec03c6a7011567a2c2f838e01952161de78d5d; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## SessionEventStreamOperation

根据会话 ID 和不透明的更新游标构建订阅路径与请求。

从 `@openagentkit/sdk/providers/session-events` 导入 `SessionEventStreamOperation`。
公开入口为 `packages/sdk/src/providers/session-events/index.ts`，声明位于 `packages/sdk/src/providers/session-events/provider.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/normalized-provider.ts)


```ts
import type { SessionEventStreamOperation } from "@openagentkit/sdk/providers/session-events";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `buildRequest` | 是 | `(input: { sessionId: string; after?: string \| null; }, context: BackendRequestContext) => BackendRequestSpec \| Promise<BackendRequestSpec>` |

<!-- source-sha256: 4bb2596eaf0c93fa5f93da6b7dec03c6a7011567a2c2f838e01952161de78d5d; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BackendOperation

描述有类型的后端请求构建与响应映射，由共享 Request 层执行一次。

从 `@openagentkit/sdk/providers` 导入 `BackendOperation`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/http-operation.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/normalized-provider.ts)


```ts
import type { BackendOperation } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `buildRequest` | 是 | `(input: Input, context: BackendRequestContext) => BackendRequestSpec \| Promise<BackendRequestSpec>` |
| `mapResponse` | 是 | `(response: Response, context: BackendRequestContext & { input: Input; }) => Output \| Promise<Output>` |

<!-- source-sha256: 95e4e1902f98e59c4d858a99fc748604ff240102a24e9ba4837041b4d7e51e7d; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BackendRequestContext

Provider 持有的取消上下文，随请求构建和响应映射传递。

从 `@openagentkit/sdk/providers` 导入 `BackendRequestContext`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/http-operation.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/normalized-provider.ts)


```ts
import type { BackendRequestContext } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `signal` | 否 | `AbortSignal \| undefined` |

<!-- source-sha256: 95e4e1902f98e59c4d858a99fc748604ff240102a24e9ba4837041b4d7e51e7d; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BackendRequestSpec

描述后端路径和可选的 RequestInit，其 signal 由 Provider 管理。

从 `@openagentkit/sdk/providers` 导入 `BackendRequestSpec`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/http-operation.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/normalized-provider.ts)


```ts
import type { BackendRequestSpec } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `path` | 是 | `string` |
| `init` | 否 | `Omit<RequestInit, "signal"> \| undefined` |

<!-- source-sha256: 95e4e1902f98e59c4d858a99fc748604ff240102a24e9ba4837041b4d7e51e7d; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## createSseStream

将现有字节流解码为原始 SSE 帧，网络请求和业务转换由上层处理。

从 `@openagentkit/sdk/stream` 导入 `createSseStream`。
公开入口为 `packages/sdk/src/stream/index.ts`，声明位于 `packages/sdk/src/stream/index.ts`。
说明来自 `apps/storybook/content/docs/sdk/stream.mdx`。
[可编译示例](../examples/sse-stream.ts)

- 使用 for await 迭代。data 保持为字符串，由 Provider 校验其业务含义。
- utf8Fatal 默认 false，flushOnEnd 默认 true，只有传入 maxFrameChars 才限制帧大小。
- 取消、提前退出迭代和解析失败都会释放 reader。Agent 是否执行完成由业务状态判断。

```ts
export function createSseStream(body: ReadableStream<Uint8Array>, options?: SseStreamOptions): AsyncGenerator<RawSseMessage, void, unknown>;
```


<!-- source-sha256: 4d5f0820913988ab5b5767da59f3eaedc9e2adc54264f6d21cad7f6a6bdc2b99; doc-sha256: 28a2b134f45aa633a78c3ea7121a45f36a7d0f24b115f5c09016b6e855f4b254 -->

## SseStreamOptions

配置取消、UTF-8 严格模式、帧大小、注释通知及末尾帧交付。

从 `@openagentkit/sdk/stream` 导入 `SseStreamOptions`。
公开入口为 `packages/sdk/src/stream/index.ts`，声明位于 `packages/sdk/src/stream/index.ts`。
说明来自 `apps/storybook/content/docs/sdk/stream.mdx`。
[可编译示例](../examples/sse-stream.ts)


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

<!-- source-sha256: 4d5f0820913988ab5b5767da59f3eaedc9e2adc54264f6d21cad7f6a6bdc2b99; doc-sha256: 28a2b134f45aa633a78c3ea7121a45f36a7d0f24b115f5c09016b6e855f4b254 -->

## SseStreamError

表示安全的解码或分帧错误，reader 的传输错误沿用原有语义。

从 `@openagentkit/sdk/stream` 导入 `SseStreamError`。
公开入口为 `packages/sdk/src/stream/index.ts`，声明位于 `packages/sdk/src/stream/index.ts`。
说明来自 `apps/storybook/content/docs/sdk/stream.mdx`。
[可编译示例](../examples/sse-stream.ts)

- Provider 决定错误是否可重试。帧格式错误须显式报告。

```ts
declare class SseStreamError {
  constructor(cause: unknown);
}
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `name` | 是 | `"SseStreamError"` |
| `message` | 是 | `string` |
| `stack` | 否 | `string \| undefined` |
| `cause` | 否 | `unknown` |

<!-- source-sha256: 4d5f0820913988ab5b5767da59f3eaedc9e2adc54264f6d21cad7f6a6bdc2b99; doc-sha256: 28a2b134f45aa633a78c3ea7121a45f36a7d0f24b115f5c09016b6e855f4b254 -->

## createRequest

创建独立 HTTP 客户端，通过 createSseStream 读取 SSE。

从 `@openagentkit/sdk/request` 导入 `createRequest`。
公开入口为 `packages/sdk/src/request/index.ts`，声明位于 `packages/sdk/src/request/index.ts`。
说明来自 `apps/storybook/content/docs/sdk/request.mdx`。
[可编译示例](../examples/request.ts)

- 重试、超时、Kit 协议头和 Content-Type 均由调用方配置。
- 每次请求解析应用身份头，单次请求头优先。

```ts
export function createRequest(options: RequestOptions): RequestClient;
```


<!-- source-sha256: 17b8c5e483c20b8545d74481f95232b8aa44db9de577e98623d4a5610db7864d; doc-sha256: 151d442c92d80ab357db33d191291a63ee7ca7d12f6ab8fed87d3bc4bec91039 -->

## RequestClient

为应用后端提供响应、JSON、原始 SSE 和 URL 方法。

从 `@openagentkit/sdk/request` 导入 `RequestClient`。
公开入口为 `packages/sdk/src/request/index.ts`，声明位于 `packages/sdk/src/request/index.ts`。
说明来自 `apps/storybook/content/docs/sdk/request.mdx`。
[可编译示例](../examples/request.ts)

- response 将响应体交给调用方。stream 在迭代结束时释放 reader。
- json 解析 JSON，业务 Schema 另行校验。HTTP 204 返回 undefined。

```ts
import type { RequestClient } from "@openagentkit/sdk/request";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `url` | 是 | `(path: string) => string` |
| `response` | 是 | `(path: string, init?: RequestInit) => Promise<Response>` |
| `json` | 是 | `<T>(path: string, init?: RequestInit) => Promise<T>` |
| `stream` | 是 | `(path: string, init?: RequestInit, options?: SseStreamOptions) => AsyncGenerator<RawSseMessage, void, unknown>` |

<!-- source-sha256: 17b8c5e483c20b8545d74481f95232b8aa44db9de577e98623d4a5610db7864d; doc-sha256: 151d442c92d80ab357db33d191291a63ee7ca7d12f6ab8fed87d3bc4bec91039 -->

## RequestOptions

配置显式 base URL、异步 HeadersInit、注入的 fetch 和安全的 HTTP 错误映射。

从 `@openagentkit/sdk/request` 导入 `RequestOptions`。
公开入口为 `packages/sdk/src/request/index.ts`，声明位于 `packages/sdk/src/request/index.ts`。
说明来自 `apps/storybook/content/docs/sdk/request.mdx`。
[可编译示例](../examples/request.ts)

- Provider 凭据保留在后端。
- mapHttpError 返回 Error，避免直接透传任意后端响应体。

```ts
import type { RequestOptions } from "@openagentkit/sdk/request";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `baseUrl` | 是 | `string` |
| `headers` | 否 | `(() => HeadersInit \| Promise<HeadersInit>) \| undefined` |
| `fetchImpl` | 否 | `{ (input: RequestInfo \| URL, init?: RequestInit): Promise<Response>; (input: string \| URL \| Request, init?: RequestInit): Promise<Response>; } \| undefined` |
| `mapHttpError` | 否 | `((response: Response) => Error \| Promise<Error>) \| undefined` |

<!-- source-sha256: 17b8c5e483c20b8545d74481f95232b8aa44db9de577e98623d4a5610db7864d; doc-sha256: 151d442c92d80ab357db33d191291a63ee7ca7d12f6ab8fed87d3bc4bec91039 -->

## ChatProvider

前端会话适配器，含五个必需操作、可选线程查询及消息转换。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/normalized-provider.ts)

- 复用同一合同接入已有的百炼上游。
- 创建和列出会话、上传及下载文件分别走独立操作。
- 每次 stream 管理一条连接，重试由控制器调度。
- Chat 持有事件账本及返回的消息。省略转换策略时使用 transformSessionEvent。

```ts
import type { ChatProvider } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `transformMessage` | 否 | `MessageTransformer \| undefined` |
| `listEvents` | 否 | `((sessionId: string, options?: EventQueryOptions) => Promise<EventsPage>) \| undefined` |
| `listThreads` | 否 | `((sessionId: string, options?: ThreadQueryOptions) => Promise<SessionThreadsResponse>) \| undefined` |
| `listThreadEvents` | 否 | `((sessionId: string, threadId: string, options?: ThreadQueryOptions) => Promise<EventsPage>) \| undefined` |
| `stream` | 是 | `(sessionId: string, options?: StreamSessionOptions) => Promise<void>` |
| `sendMessage` | 是 | `(sessionId: string, body: SendMessageRequest) => Promise<SendMessageResponse>` |
| `interrupt` | 是 | `(sessionId: string) => Promise<{ interrupted: boolean; }>` |
| `toolApprovals` | 是 | `(sessionId: string) => Promise<ToolApprovalsResponse>` |
| `submitToolApproval` | 是 | `(sessionId: string, decision: ToolApprovalDecision) => Promise<SendMessageResponse>` |

<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ChatProvider.stream

建立一条可取消的持久订阅，交付 SessionEvent 快照和生命周期回调。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/normalized-provider.ts)

- 标准事件流的 ready 表示实时订阅就绪，Controller 通过 listEvents 读取历史。
- 由控制器重连，续传使用不透明的更新游标。
- 意外 EOF 属于可恢复的传输故障，业务完成由会话状态决定。

```ts
// ChatProvider.stream 的类型
(sessionId: string, options?: StreamSessionOptions) => Promise<void>
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ChatProvider.listEvents

纯实时接入的历史分页操作，按升序返回 EventsPage。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/backend-http.ts)


```ts
// ChatProvider.listEvents 的类型
((sessionId: string, options?: EventQueryOptions) => Promise<EventsPage>) | undefined
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ChatProvider.sendMessage

提交一次文本及客户端标识，返回实际的受理结果。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/backend-http.ts)

- 保留 client_message_id 和 event_ids，用于乐观消息对账。

```ts
// ChatProvider.sendMessage 的类型
(sessionId: string, body: SendMessageRequest) => Promise<SendMessageResponse>
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ChatProvider.interrupt

请求中断远端执行，取消订阅只影响本地连接。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/backend-http.ts)


```ts
// ChatProvider.interrupt 的类型
(sessionId: string) => Promise<{ interrupted: boolean; }>
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ChatProvider.toolApprovals

获取当前待审批批次及调用，以及完整的冻结工具参数。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/tool-approvals.mdx`。
[可编译示例](../examples/backend-http.ts)

- 只有当前有效的待处理请求可以激活审批。

```ts
// ChatProvider.toolApprovals 的类型
(sessionId: string) => Promise<ToolApprovalsResponse>
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: 03e164c0199edd9510cc7c6ebd1036abc697a376d45c2586623da56a188c80aa -->

## ChatProvider.submitToolApproval

由后端校验归属及待处理状态后，提交一次允许或拒绝决定。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/tool-approvals.mdx`。
[可编译示例](../examples/backend-http.ts)

- 禁止自动重试 POST。响应结果不确定时先刷新，再由用户重新确认。

```ts
// ChatProvider.submitToolApproval 的类型
(sessionId: string, decision: ToolApprovalDecision) => Promise<SendMessageResponse>
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: 03e164c0199edd9510cc7c6ebd1036abc697a376d45c2586623da56a188c80aa -->

## ChatProvider.transformMessage

可选的同步事件到消息转换策略，由 Chat 用最新快照重建消息时调用。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/message-transform.ts)

- 省略时沿用 transformSessionEvent。
- 转换期间的消息由 Chat 持有，使用累计快照替换内容，避免跨会话缓存或重复追加。

```ts
// ChatProvider.transformMessage 的类型
MessageTransformer | undefined
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## transformSessionEvent

Kit 与百炼原始流 Provider 共用的纯函数，将 SessionEvent 转换为 ChatMessage。

从 `@openagentkit/sdk/messages` 导入 `transformSessionEvent`。
公开入口为 `packages/sdk/src/messages/index.ts`，声明位于 `packages/sdk/src/messages/merge.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/message-transform.ts)

- 使用传入的 identity 保留稳定的消息和分片 ID。
- 转换只影响展示。Chat 持有执行、乐观对账、审批和重连状态。
- 百炼原始 SSE 由上游公开归一工具处理，本函数只接受标准事件。

```ts
export function transformSessionEvent({ messages, event, identity }: MessageTransformInput): MessageTransformResult;
```


<!-- source-sha256: 7d5419a70b48cb015bc5eaf95e904ba9eae9c6c440ba48fb4d0bfa3d6faef0b0; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## MessageTransformer

同步转换消息的函数，只处理本次传入的数据。

从 `@openagentkit/sdk/messages` 导入 `MessageTransformer`。
公开入口为 `packages/sdk/src/messages/index.ts`，声明位于 `packages/sdk/src/messages/types.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/message-transform.ts)


```ts
export type MessageTransformer = (input: MessageTransformInput) => MessageTransformResult;
```


<!-- source-sha256: 2f667950b58a0e64a5f120121ffccbd5dbd59b0bcb45c6c653a8c0cc6b30cfb0; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## MessageTransformInput

当前线程的临时消息、一条最新 SessionEvent 快照及 Chat 为它分配的稳定标识。

从 `@openagentkit/sdk/messages` 导入 `MessageTransformInput`。
公开入口为 `packages/sdk/src/messages/index.ts`，声明位于 `packages/sdk/src/messages/types.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/message-transform.ts)

- 数组归本次重建所有，调用完成后不保留数组，也不修改原事件。

```ts
import type { MessageTransformInput } from "@openagentkit/sdk/messages";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `messages` | 是 | `ChatMessage[]` |
| `event` | 是 | `{ type: string; event_id?: string \| undefined; role?: string \| undefined; created_at?: string \| undefined; content?: { [x: string]: unknown; type: string; text?: string \| undefined; data?: unknown; }[] \| undefined; metadata?: Record<string, unknown> \| undefined; is_error?: boolean \| null \| undefined; code?: string \| null \| undefined; message?: string \| null \| undefined; }` |
| `identity` | 是 | `string` |

<!-- source-sha256: 2f667950b58a0e64a5f120121ffccbd5dbd59b0bcb45c6c653a8c0cc6b30cfb0; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## MessageTransformResult

更新后的或替换用的消息数组及可选产物，返回后由 Chat 持有。

从 `@openagentkit/sdk/messages` 导入 `MessageTransformResult`。
公开入口为 `packages/sdk/src/messages/index.ts`，声明位于 `packages/sdk/src/messages/types.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/message-transform.ts)

- 适配默认结果时保留消息 ID、分片 ID 和对账字段。

```ts
import type { MessageTransformResult } from "@openagentkit/sdk/messages";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `messages` | 是 | `ChatMessage[]` |
| `artifacts` | 否 | `ArtifactDescriptor[] \| undefined` |

<!-- source-sha256: 2f667950b58a0e64a5f120121ffccbd5dbd59b0bcb45c6c653a8c0cc6b30cfb0; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## createKitChatProvider

包装已有 KitClient 并使用默认 transformSessionEvent，沿用其请求路径、游标及重试行为。

从 `@openagentkit/sdk/providers/kit` 导入 `createKitChatProvider`。
公开入口为 `packages/sdk/src/providers/kit/index.ts`，声明位于 `packages/sdk/src/providers/kit/provider.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/kit-client-provider.ts)


```ts
export function createKitChatProvider(client: Pick<KitClient, "listEvents" | "stream" | "sendMessage" | "interrupt" | "toolApprovals" | "submitToolApproval"> & Partial<Pick<KitClient, "listThreads" | "listThreadEvents">>): ChatProvider;
```


<!-- source-sha256: 34eb6398edf2d71473f231fa00e4c5d1de6f05df46f237ce9cb91d8544e5bfde; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## StreamSessionOptions

取消信号、可选不透明重放游标，以及 reset、event、ready、done、ping 回调。

从 `@openagentkit/sdk/providers` 导入 `StreamSessionOptions`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/stream.mdx`。
[可编译示例](../examples/normalized-provider.ts)

- onEvent 接收累计 SDK 快照，包括对已有事件 ID 的更新。
- onReset 开始重建，onReady 提交完整的权威结果。
- onDone 表示传输明确终止，onPing 表示传输仍活跃。

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

<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: 28a2b134f45aa633a78c3ea7121a45f36a7d0f24b115f5c09016b6e855f4b254 -->

## createBailianChatProvider

通过 RequestClient 将六个必需操作和两个可选线程操作适配为 ChatProvider。

从 `@openagentkit/sdk/providers/bailian` 导入 `createBailianChatProvider`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/provider.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)

- 事件转换使用 SDK 的 session-events 公开归一器。Kit Server 查询线程历史使用 SDK 的公开线程接口。
- Kit 负责分帧和恢复，SDK 负责累计事件的转换。
- 订阅和发送消息通过两个独立请求完成。
- 使用 transformSessionEvent 生成展示数据，SDK 归一化在此前完成。

```ts
export function createBailianChatProvider(options: BailianChatProviderOptions): ChatProvider;
```


<!-- source-sha256: fa4a77bb4e97bdb8812a1f604b3d1f74e4ec5ae37c1d8b24135f66008aee9eb9; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BailianChatProviderOptions

包括必需的 RequestClient、六个 buildRequest 和 mapResponse 操作，以及有上限的恢复配置。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianChatProviderOptions`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)

- 默认 connectTimeoutMs 为 30000、idleTimeoutMs 为 45000、maxBufferedFrames 为 1024、maxBufferedBytes 为 8388608、maxHistoryEvents 为 10000。
- 达到上限时明确失败，保留历史和缓冲更新的完整性要求。
- 每次重连重建完整历史，Kit 的 after 游标不传给百炼原始流。

```ts
import type { BailianChatProviderOptions } from "@openagentkit/sdk/providers/bailian";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `request` | 是 | `RequestClient` |
| `openStream` | 是 | `BailianOperation<{ sessionId: string; }, BailianStreamResponse>` |
| `listEvents` | 是 | `BailianOperation<{ sessionId: string; pageToken?: string; }, BailianEventsPage>` |
| `sendMessage` | 是 | `BailianOperation<{ sessionId: string; body: SendMessageRequest; }, { session_id: string; accepted: boolean; event_ids: string[]; }>` |
| `interrupt` | 是 | `BailianOperation<{ sessionId: string; }, { interrupted: boolean; }>` |
| `toolApprovals` | 是 | `BailianOperation<{ sessionId: string; }, { requires_action: boolean; batch_id: string \| null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string \| null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string \| undefined; session_thread_id?: string \| undefined; status?: "pending" \| "submitted" \| "uncertain" \| undefined; result?: "allow" \| "deny" \| undefined; }[]; }>` |
| `submitToolApproval` | 是 | `BailianOperation<{ sessionId: string; decision: ToolApprovalDecision; }, { session_id: string; accepted: boolean; event_ids: string[]; }>` |
| `connectTimeoutMs` | 否 | `number \| undefined` |
| `idleTimeoutMs` | 否 | `number \| undefined` |
| `maxBufferedFrames` | 否 | `number \| undefined` |
| `maxBufferedBytes` | 否 | `number \| undefined` |
| `maxHistoryEvents` | 否 | `number \| undefined` |
| `listThreads` | 否 | `BailianOperation<BailianThreadQuery, { data: { id: string; session_id: string; parent_thread_id: string; agent: { id: string; version?: number \| undefined; name?: string \| undefined; }; status: string; created_at: string; updated_at: string; agent_name?: string \| undefined; archived_at?: string \| null \| undefined; }[]; next_page_token: string \| null; }> \| undefined` |
| `listThreadEvents` | 否 | `BailianOperation<BailianThreadQuery & { threadId: string; }, BailianEventsPage> \| undefined` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## openStream

描述原始订阅请求，映射未经消费的 Response 和真实的上游就绪 Promise。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianChatProviderOptions`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)

- Provider 在请求构建、HTTP 执行和响应映射时传入取消信号。
- mapResponse 立即返回响应和 ready，使工厂可在等待就绪期间开始读取。
- HTTP 200 或首条业务事件无法单独证明订阅已就绪。
- 示例只在后端保证先建立订阅再发送响应头时接受 x-upstream-ready。

```ts
// openStream 的类型
BackendOperation<{ sessionId: string; }, BailianStreamResponse>
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `buildRequest` | 是 | `(input: { sessionId: string; }, context: BackendRequestContext) => BackendRequestSpec \| Promise<BackendRequestSpec>` |
| `mapResponse` | 是 | `(response: Response, context: BackendRequestContext & { input: { sessionId: string; }; }) => BailianStreamResponse \| Promise<BailianStreamResponse>` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## listEvents

描述单次升序历史分页请求，将完整原始事件与不透明的下一页游标映射给 Provider。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianChatProviderOptions`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)

- 保留事件身份、时间戳、内容、生命周期信息和主会话状态。
- 须返回完整历史。同 ID 快照冲突时需要更新依据。
- created_at 只表示创建时间，快照更新须使用相应版本依据。

```ts
// listEvents 的类型
BackendOperation<{ sessionId: string; pageToken?: string; }, BailianEventsPage>
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `buildRequest` | 是 | `(input: { sessionId: string; pageToken?: string; }, context: BackendRequestContext) => BackendRequestSpec \| Promise<BackendRequestSpec>` |
| `mapResponse` | 是 | `(response: Response, context: BackendRequestContext & { input: { sessionId: string; pageToken?: string; }; }) => BailianEventsPage \| Promise<BailianEventsPage>` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BailianStreamResponse

原始流式 HTTP 响应及表示上游真实就绪的 Promise。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianStreamResponse`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)


```ts
import type { BailianStreamResponse } from "@openagentkit/sdk/providers/bailian";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `response` | 是 | `Response` |
| `ready` | 是 | `Promise<void>` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BailianEventsPage

按升序排列的完整原始历史对象及可选的下一页游标。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianEventsPage`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)

- 游标为 null 或缺失时结束分页。更新重放须使用独立游标。

```ts
import type { BailianEventsPage } from "@openagentkit/sdk/providers/bailian";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `events` | 是 | `Record<string, unknown>[]` |
| `nextPageToken` | 否 | `string \| null \| undefined` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## SessionEvent

由 SDK 定义的业务事件合同，供 Kit 的标准事件流和消息投影使用。

从 `@openagentkit/sdk/protocol` 导入 `SessionEvent`。
公开入口为 `packages/sdk/src/protocol/index.ts`，声明位于 `packages/sdk/src/protocol/index.ts`。
说明来自 `apps/storybook/content/docs/sdk/stream.mdx`。
[可编译示例](../examples/normalized-provider.ts)

- 保留未知事件类型和内容块，供界面安全兜底展示。
- ready、reset、ping 和 done 属于传输控制帧。

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

<!-- source-sha256: 19898cd813f32186233349faf10be579ce2e7ab95461563eb7b354c2abd7ad1f; doc-sha256: 28a2b134f45aa633a78c3ea7121a45f36a7d0f24b115f5c09016b6e855f4b254 -->

## SendMessageRequest

提交消息文本，可携带乐观消息标识、技能名单和随消息挂载的附件引用。

从 `@openagentkit/sdk/protocol` 导入 `SendMessageRequest`。
公开入口为 `packages/sdk/src/protocol/index.ts`，声明位于 `packages/sdk/src/protocol/api.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/backend-http.ts)


```ts
export type SendMessageRequest = { text: string; skills?: string[] | undefined; attachments?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; client_message_id?: string | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `text` | 是 | `string` |
| `skills` | 否 | `string[] \| undefined` |
| `attachments` | 否 | `{ file_id: string; filename?: string \| undefined; mount_path?: string \| undefined; size?: number \| undefined; }[] \| undefined` |
| `client_message_id` | 否 | `string \| undefined` |

<!-- source-sha256: f008d1a064b6a04a7388b710654aef8bdcee552ea1c0905a60e07aef568ed97b; doc-sha256: 4c2b40f47124216a98f9ea6503bd98710fdfc352a86efbaf3b16868f14b4139a -->

## SendMessageResponse

写请求返回的真实会话 ID、受理标记和已提交的事件 ID。

从 `@openagentkit/sdk/protocol` 导入 `SendMessageResponse`。
公开入口为 `packages/sdk/src/protocol/index.ts`，声明位于 `packages/sdk/src/protocol/api.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/backend-http.ts)


```ts
export type SendMessageResponse = { session_id: string; accepted: boolean; event_ids: string[]; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `session_id` | 是 | `string` |
| `accepted` | 是 | `boolean` |
| `event_ids` | 是 | `string[]` |

<!-- source-sha256: f008d1a064b6a04a7388b710654aef8bdcee552ea1c0905a60e07aef568ed97b; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ToolApprovalsResponse

当前 requires_action 状态、待审批批次及调用，以及冻结的工具请求。

从 `@openagentkit/sdk/protocol` 导入 `ToolApprovalsResponse`。
公开入口为 `packages/sdk/src/protocol/index.ts`，声明位于 `packages/sdk/src/protocol/tool-approvals.ts`。
说明来自 `apps/storybook/content/docs/sdk/tool-approvals.mdx`。
[可编译示例](../examples/backend-http.ts)


```ts
export type ToolApprovalsResponse = { requires_action: boolean; batch_id: string | null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string | null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string | undefined; session_thread_id?: string | undefined; status?: "pending" | "submitted" | "uncertain" | undefined; result?: "allow" | "deny" | undefined; }[]; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `requires_action` | 是 | `boolean` |
| `batch_id` | 是 | `string \| null` |
| `pending_call_ids` | 是 | `string[]` |
| `requests` | 是 | `{ batch_id: string; call_id: string; request_event_id: string \| null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string \| undefined; session_thread_id?: string \| undefined; status?: "pending" \| "submitted" \| "uncertain" \| undefined; result?: "allow" \| "deny" \| undefined; }[]` |

<!-- source-sha256: d2f0f317f4cf23f039f2a01196acb1a226be2fa48e2800bcf62c4021030a005d; doc-sha256: 03e164c0199edd9510cc7c6ebd1036abc697a376d45c2586623da56a188c80aa -->

## ToolApprovalDecision

由当前批次及调用唯一标识的一次显式允许或拒绝决定。

从 `@openagentkit/sdk/protocol` 导入 `ToolApprovalDecision`。
公开入口为 `packages/sdk/src/protocol/index.ts`，声明位于 `packages/sdk/src/protocol/tool-approvals.ts`。
说明来自 `apps/storybook/content/docs/sdk/tool-approvals.mdx`。
[可编译示例](../examples/backend-http.ts)


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

## KitError

通过安全错误码、摘要和明确的可重试标记指导控制器恢复。

从 `@openagentkit/sdk/protocol` 导入 `KitError`。
公开入口为 `packages/sdk/src/protocol/index.ts`，声明位于 `packages/sdk/src/protocol/errors.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/backend-http.ts)

- 错误中须隐藏后端响应体、鉴权请求头及 Provider 凭据。
- 鉴权和合同错误停止自动重连，临时传输故障可重试。

```ts
declare class KitError {
  constructor(code: ErrorCode, message: string, options?: { details?: unknown; messageKey?: string; messageParams?: KitErrorMessageParams; retryable?: boolean; status?: number; });
}
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `code` | 是 | `"invalid_request" \| "unauthorized" \| "forbidden" \| "not_found" \| "conflict" \| "confirmation_required" \| "rate_limited" \| "quota_exceeded" \| "request_pending" \| "provider_error" \| "not_implemented" \| "internal"` |
| `details` | 否 | `unknown` |
| `messageKey` | 否 | `string \| undefined` |
| `messageParams` | 否 | `KitErrorMessageParams \| undefined` |
| `retryable` | 是 | `boolean` |
| `status` | 是 | `number` |
| `toBody` | 是 | `() => KitErrorBody` |
| `name` | 是 | `string` |
| `message` | 是 | `string` |
| `stack` | 否 | `string \| undefined` |
| `cause` | 否 | `unknown` |

<!-- source-sha256: 97c46811e0d3727b5648a249d5566c657ba7392501d96f017e545a7e18403bc1; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BailianOperation

描述后端请求及响应转换，HTTP 请求由 Provider 与 RequestClient 执行。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianOperation`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)


```ts
export type BailianOperation = BackendOperation<Input, Output>;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `buildRequest` | 是 | `(input: Input, context: BackendRequestContext) => BackendRequestSpec \| Promise<BackendRequestSpec>` |
| `mapResponse` | 是 | `(response: Response, context: BackendRequestContext & { input: Input; }) => Output \| Promise<Output>` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BailianRequestSpec

应用路径及不含 signal 的 RequestInit，取消由 Provider 管理。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianRequestSpec`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)


```ts
export type BailianRequestSpec = BackendRequestSpec;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `path` | 是 | `string` |
| `init` | 否 | `Omit<RequestInit, "signal"> \| undefined` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BailianRequestContext

请求构建和响应映射共用的 Provider 取消上下文。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianRequestContext`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/raw-bailian-provider.ts)


```ts
export type BailianRequestContext = BackendRequestContext;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `signal` | 否 | `AbortSignal \| undefined` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## createBailianThreadOperations

提供百炼标准线程列表和线程事件操作配置。代理可自定义 basePath 或映射。

从 `@openagentkit/sdk/providers/bailian` 导入 `createBailianThreadOperations`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/threads.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/multi-agent.tsx)


```ts
export function createBailianThreadOperations(options?: { basePath?: string; }): BailianThreadOperations;
```


<!-- source-sha256: 57c980cfbad8f9874f7fea82f85630a6987db09f32cdfd876f5e6abe97bdaaee; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BailianThreadOperations

百炼原始流 Provider 的可选线程查询配置。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianThreadOperations`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/multi-agent.tsx)


```ts
import type { BailianThreadOperations } from "@openagentkit/sdk/providers/bailian";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `listThreads` | 是 | `BailianOperation<BailianThreadQuery, { data: { id: string; session_id: string; parent_thread_id: string; agent: { id: string; version?: number \| undefined; name?: string \| undefined; }; status: string; created_at: string; updated_at: string; agent_name?: string \| undefined; archived_at?: string \| null \| undefined; }[]; next_page_token: string \| null; }>` |
| `listThreadEvents` | 是 | `BailianOperation<BailianThreadQuery & { threadId: string; }, BailianEventsPage>` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## BailianThreadQuery

包含会话标识和不透明的线程查询分页选项。

从 `@openagentkit/sdk/providers/bailian` 导入 `BailianThreadQuery`。
公开入口为 `packages/sdk/src/providers/bailian/index.ts`，声明位于 `packages/sdk/src/providers/bailian/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/multi-agent.tsx)


```ts
import type { BailianThreadQuery } from "@openagentkit/sdk/providers/bailian";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sessionId` | 是 | `string` |
| `limit` | 否 | `number \| undefined` |
| `pageToken` | 否 | `string \| undefined` |

<!-- source-sha256: 76c47a6fd93c407487caf5dc8458d6d433396a83c244dd6525bc26e3685abf7c; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ThreadQueryOptions

标准事件线程查询的可选页大小、游标和 AbortSignal。

从 `@openagentkit/sdk/providers` 导入 `ThreadQueryOptions`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/multi-agent.tsx)


```ts
import type { ThreadQueryOptions } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `limit` | 否 | `number \| undefined` |
| `pageToken` | 否 | `string \| undefined` |
| `signal` | 否 | `AbortSignal \| undefined` |

<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ChatProvider.listThreads

可选的子 Agent 线程列表查询，须保留会话归属和取消信号。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/multi-agent.tsx)


```ts
// ChatProvider.listThreads 的类型
((sessionId: string, options?: ThreadQueryOptions) => Promise<SessionThreadsResponse>) | undefined
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ChatProvider.listThreadEvents

可选的子 Agent 线程历史查询，须保留会话归属和取消信号。

从 `@openagentkit/sdk/providers` 导入 `ChatProvider`。
公开入口为 `packages/sdk/src/providers/index.ts`，声明位于 `packages/sdk/src/providers/contract.ts`。
说明来自 `apps/storybook/content/docs/sdk/custom-backend.mdx`。
[可编译示例](../examples/multi-agent.tsx)


```ts
// ChatProvider.listThreadEvents 的类型
((sessionId: string, threadId: string, options?: ThreadQueryOptions) => Promise<EventsPage>) | undefined
```


<!-- source-sha256: 321c50f154d11300f499af0247a896a9daf157504c052cc59f1694d636ade6df; doc-sha256: c1f8643aef8e7a1223d1532f9ac682e3a9a43886e780333ebdf3ee024cebe717 -->

## ClientOperations

通过 buildRequest 和 mapResponse 配置的可选类型化操作。

从 `@openagentkit/sdk/providers/kit` 导入 `ClientOperations`。
公开入口为 `packages/sdk/src/providers/kit/index.ts`，声明位于 `packages/sdk/src/providers/kit/client.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/backend-data.ts)


```ts
export type ClientOperations = { agent?: BackendOperation<[slug: string, signal?: AbortSignal | undefined], { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; id: string; remote_agent_id: string; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; remote_agent_version?: number | undefined; resources?: { tools: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; skills: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; mcp_servers: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; } | undefined; memory_stores?: { name: string; description?: string | undefined; }[] | undefined; }> | undefined; config?: BackendOperation<[signal?: AbortSignal | undefined], { apiBaseUrl: string; protocolVersion: string; gateway: "sdk" | "mock"; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; }; branding: { productName: string; logoUrl?: string | undefined; accent?: string | undefined; }; auth?: { mode: "member" | "anonymous"; passwordLogin: true; } | undefined; }> | undefined; agents?: BackendOperation<[signal?: AbortSignal | undefined], { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]> | undefined; plaza?: BackendOperation<[query?: { category?: PlazaCategory; q?: string; } | undefined, signal?: AbortSignal | undefined], { agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string | undefined; }; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" | "general" | "writing" | "coding" | "other"; name: string; count: number; }[]; }> | undefined; usageLimits?: BackendOperation<[query?: { days?: number; } | undefined, signal?: AbortSignal | undefined], { member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; }; override: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; } | null; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string | undefined; } | null> | undefined; quota?: BackendOperation<[query?: { days?: number; } | undefined, signal?: AbortSignal | undefined], { month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number | null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string | undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; } | null; }> | undefined; quotaRequests?: BackendOperation<[signal?: AbortSignal | undefined], { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }[]> | undefined; createQuotaRequest?: BackendOperation<[body: { requestedCredits: number; reason?: string; }, signal?: AbortSignal | undefined], { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }> | undefined; sessions?: BackendOperation<[query?: SessionListQuery | undefined, signal?: AbortSignal | undefined], { sessions: { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]; nextPageToken: string | null; }> | undefined; sessionAgents?: BackendOperation<[signal?: AbortSignal | undefined], string[]> | undefined; createSession?: BackendOperation<[body: { agentSlug: string; title?: string; files?: AttachmentRef[]; }, signal?: AbortSignal | undefined], { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }> | undefined; session?: BackendOperation<[id: string, signal?: AbortSignal | undefined], { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }> | undefined; renameSession?: BackendOperation<[id: string, title: string, signal?: AbortSignal | undefined], { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }> | undefined; sendMessage?: BackendOperation<[sessionId: string, body: { text: string; skills?: string[] | undefined; attachments?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; client_message_id?: string | undefined; }], { session_id: string; accepted: boolean; event_ids: string[]; }> | undefined; toolApprovals?: BackendOperation<[sessionId: string], { requires_action: boolean; batch_id: string | null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string | null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string | undefined; session_thread_id?: string | undefined; status?: "pending" | "submitted" | "uncertain" | undefined; result?: "allow" | "deny" | undefined; }[]; }> | undefined; submitToolApproval?: BackendOperation<[sessionId: string, decision: { batch_id: string; call_id: string; result: "allow" | "deny"; deny_message?: string | undefined; }], { session_id: string; accepted: boolean; event_ids: string[]; }> | undefined; interrupt?: BackendOperation<[sessionId: string], { interrupted: boolean; }> | undefined; events?: BackendOperation<[sessionId: string, query?: EventQueryOptions | undefined], EventsPage> | undefined; listThreads?: BackendOperation<[sessionId: string, query?: ThreadQueryOptions | undefined], { data: { id: string; session_id: string; parent_thread_id: string; agent: { id: string; version?: number | undefined; name?: string | undefined; }; status: string; created_at: string; updated_at: string; agent_name?: string | undefined; archived_at?: string | null | undefined; }[]; next_page_token: string | null; }> | undefined; listThreadEvents?: BackendOperation<[sessionId: string, threadId: string, query?: ThreadQueryOptions | undefined], EventsPage> | undefined; sessionPlan?: BackendOperation<[sessionId: string, action: "archive" | "delete", signal?: AbortSignal | undefined], { plan_id: string; confirm_token: string; destructive: boolean; expires_at: number; diff: { resource: string; action: string; destructive: boolean; }[]; }> | undefined; archiveSession?: BackendOperation<[sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal | undefined], { archived: boolean; }> | undefined; deleteSession?: BackendOperation<[sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal | undefined], { deleted: boolean; }> | undefined; uploadFile?: BackendOperation<[file: { name: string; bytes: Uint8Array; mimeType?: string; }, signal?: AbortSignal | undefined], { file_id: string; filename: string; size: number; }> | undefined; fileStatus?: BackendOperation<[fileId: string, signal?: AbortSignal | undefined], { file_id: string; status: string | null; available: boolean; }> | undefined; downloadFile?: BackendOperation<[fileId: string, input?: { sessionId?: string; signal?: AbortSignal; } | undefined], Response> | undefined; "auth.login"?: BackendOperation<[body: { username: string; password: string; }, signal?: AbortSignal | undefined], { access_token: string; token_type: "Bearer"; expires_at: string; member: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; }; }> | undefined; "auth.me"?: BackendOperation<[signal?: AbortSignal | undefined], { identity: { subjectId: string; displayName?: string | undefined; tier?: string | undefined; metadata?: Record<string, unknown> | undefined; }; member?: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; } | undefined; expires_at?: string | undefined; }> | undefined; "auth.logout"?: BackendOperation<[signal?: AbortSignal | undefined], void> | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `agent` | 否 | `any` |
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
| `sendMessage` | 否 | `any` |
| `toolApprovals` | 否 | `any` |
| `submitToolApproval` | 否 | `any` |
| `interrupt` | 否 | `any` |
| `events` | 否 | `any` |
| `listThreads` | 否 | `any` |
| `listThreadEvents` | 否 | `any` |
| `sessionPlan` | 否 | `any` |
| `archiveSession` | 否 | `any` |
| `deleteSession` | 否 | `any` |
| `uploadFile` | 否 | `any` |
| `fileStatus` | 否 | `any` |
| `downloadFile` | 否 | `any` |
| `auth.login` | 否 | `any` |
| `auth.me` | 否 | `any` |
| `auth.logout` | 否 | `any` |

<!-- source-sha256: f889584832ef86aac9f0354a7e6eca0672a1901ff7c46a04547f762d3d7a16e6; doc-sha256: 4c2b40f47124216a98f9ea6503bd98710fdfc352a86efbaf3b16868f14b4139a -->

## ClientOperation

数据 Client 支持的操作名。

从 `@openagentkit/sdk/providers/kit` 导入 `ClientOperation`。
公开入口为 `packages/sdk/src/providers/kit/index.ts`，声明位于 `packages/sdk/src/providers/kit/client.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/backend-data.ts)


```ts
export type ClientOperation = "agent" | "config" | "agents" | "plaza" | "usageLimits" | "quota" | "quotaRequests" | "createQuotaRequest" | "sessions" | "sessionAgents" | "createSession" | "session" | "renameSession" | "sendMessage" | "toolApprovals" | "submitToolApproval" | "interrupt" | "events" | "listThreads" | "listThreadEvents" | "sessionPlan" | "archiveSession" | "deleteSession" | "uploadFile" | "fileStatus" | "downloadFile" | "auth.login" | "auth.me" | "auth.logout";
```


<!-- source-sha256: f889584832ef86aac9f0354a7e6eca0672a1901ff7c46a04547f762d3d7a16e6; doc-sha256: 4c2b40f47124216a98f9ea6503bd98710fdfc352a86efbaf3b16868f14b4139a -->

## ExplicitKitClientOptions

接收显式注入的 Request 和 operations，业务路径由调用方配置。

从 `@openagentkit/sdk/providers/kit` 导入 `ExplicitKitClientOptions`。
公开入口为 `packages/sdk/src/providers/kit/index.ts`，声明位于 `packages/sdk/src/providers/kit/client.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/backend-data.ts)


```ts
import type { ExplicitKitClientOptions } from "@openagentkit/sdk/providers/kit";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `request` | 是 | `RequestClient` |
| `operations` | 是 | `ClientOperations` |
| `chatProvider` | 否 | `ChatProvider \| undefined` |

<!-- source-sha256: f889584832ef86aac9f0354a7e6eca0672a1901ff7c46a04547f762d3d7a16e6; doc-sha256: 4c2b40f47124216a98f9ea6503bd98710fdfc352a86efbaf3b16868f14b4139a -->

## createMemberSessionStorage

创建注入式身份存储，按完整后端 URL 隔离。

从 `@openagentkit/sdk/auth` 导入 `createMemberSessionStorage`。
公开入口为 `packages/sdk/src/auth/index.ts`，声明位于 `packages/sdk/src/auth/member-session-storage.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/backend-data.ts)


```ts
export function createMemberSessionStorage(baseUrl: string, getStorage: () => { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }): MemberSessionStorage;
```


<!-- source-sha256: a9276ea062f185c6bd12f652590c3c3f2399fc90ccb652beeec628d4de57ab0e; doc-sha256: 4c2b40f47124216a98f9ea6503bd98710fdfc352a86efbaf3b16868f14b4139a -->

## normalizeMemberApiBaseUrl

校验并规范化不含凭据的 HTTP 后端 URL。

从 `@openagentkit/sdk/auth` 导入 `normalizeMemberApiBaseUrl`。
公开入口为 `packages/sdk/src/auth/index.ts`，声明位于 `packages/sdk/src/auth/member-session-storage.ts`。
说明来自 `apps/storybook/content/docs/sdk/client.mdx`。
[可编译示例](../examples/backend-data.ts)


```ts
export function normalizeMemberApiBaseUrl(value: string, origin: string): string;
```


<!-- source-sha256: a9276ea062f185c6bd12f652590c3c3f2399fc90ccb652beeec628d4de57ab0e; doc-sha256: 4c2b40f47124216a98f9ea6503bd98710fdfc352a86efbaf3b16868f14b4139a -->

## streamProtocolFrames

通过注入的 RequestClient 消费公开协议帧，支持取消和基于有效帧的空闲检测。

从 `@openagentkit/sdk/providers/kit` 导入 `streamProtocolFrames`。
公开入口为 `packages/sdk/src/providers/kit/index.ts`，声明位于 `packages/sdk/src/providers/kit/stream.ts`。
说明来自 `apps/storybook/content/docs/sdk/stream.mdx`。
[可编译示例](../examples/protocol-frames.ts)

- 路径、身份和协议头由调用方管理，重连和 Chat 状态由控制器负责。
- done 结束单次订阅，error 和意外 EOF 导致拒绝。默认空闲超时 45000 毫秒。
- 只接收公开协议帧，百炼原始 SSE 增量应走其专用入口。

```ts
export function streamProtocolFrames(request: RequestClient, path: string, handlers?: StreamHandlers): Promise<void>;
```


<!-- source-sha256: dce3e18c126ae522692879f22fedfafca0dc592ba78c5908357d440e22ea5aba; doc-sha256: 28a2b134f45aa633a78c3ea7121a45f36a7d0f24b115f5c09016b6e855f4b254 -->

## 相关类型

以下公开类型可供离线查阅。

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


### ErrorCode

来自 `@openagentkit/sdk/protocol`。

```ts
export type ErrorCode = "invalid_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "confirmation_required" | "rate_limited" | "quota_exceeded" | "request_pending" | "provider_error" | "not_implemented" | "internal";
```



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


### EventQueryOptions

来自 `@openagentkit/sdk/providers`。

```ts
import type { EventQueryOptions } from "@openagentkit/sdk/providers";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `afterId` | 否 | `string \| undefined` |
| `limit` | 否 | `number \| undefined` |
| `pageToken` | 否 | `string \| undefined` |
| `signal` | 否 | `AbortSignal \| undefined` |


### EventsPage

来自 `@openagentkit/sdk/protocol`。

```ts
import type { EventsPage } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `data` | 是 | `{ type: string; event_id?: string \| undefined; role?: string \| undefined; created_at?: string \| undefined; content?: { [x: string]: unknown; type: string; text?: string \| undefined; data?: unknown; }[] \| undefined; metadata?: Record<string, unknown> \| undefined; is_error?: boolean \| null \| undefined; code?: string \| null \| undefined; message?: string \| null \| undefined; }[]` |
| `next_page_token` | 是 | `string \| null` |


### KitClient

来自 `@openagentkit/sdk/providers/kit`。

```ts
export type KitClient = Omit<{ transport: { request: <T>(path: string, init?: RequestInit) => Promise<T>; response: (path: string, init?: RequestInit) => Promise<Response>; stream: (path: string, handlers?: StreamHandlers) => Promise<void>; url: (path: string) => string; }; auth: { login: (body: MemberLoginRequest, signal?: AbortSignal) => Promise<{ access_token: string; token_type: "Bearer"; expires_at: string; member: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; }; }>; me: (signal?: AbortSignal) => Promise<{ identity: { subjectId: string; displayName?: string | undefined; tier?: string | undefined; metadata?: Record<string, unknown> | undefined; }; member?: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number | null; covered_sessions: number; }; output_tokens: { value: number | null; covered_sessions: number; }; cache_read_input_tokens: { value: number | null; covered_sessions: number; }; cache_creation_input_tokens: { value: number | null; covered_sessions: number; }; active_seconds: { value: number | null; covered_sessions: number; }; duration_seconds: { value: number | null; covered_sessions: number; }; }; agents: { slug: string; display_name: string | null; catalog_entry_id?: string | null | undefined; deleted?: boolean | undefined; }[]; refresh_status: "idle" | "refreshing" | "partial" | "failed"; completed_sessions: number; refreshed_at?: string | undefined; } | undefined; email?: string | undefined; } | undefined; expires_at?: string | undefined; }>; logout: (signal?: AbortSignal) => Promise<void>; }; config: (signal?: AbortSignal) => Promise<{ apiBaseUrl: string; protocolVersion: string; gateway: "sdk" | "mock"; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; }; branding: { productName: string; logoUrl?: string | undefined; accent?: string | undefined; }; auth?: { mode: "member" | "anonymous"; passwordLogin: true; } | undefined; }>; agents: (signal?: AbortSignal) => Promise<{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]>; plaza: (query?: { category?: PlazaCategory; q?: string; }, signal?: AbortSignal) => Promise<{ agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string | undefined; }; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" | "general" | "writing" | "coding" | "other"; name: string; count: number; }[]; }>; usageLimits: (query?: { days?: number; }, signal?: AbortSignal) => Promise<{ member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; }; override: { monthly_tokens: number | null; monthly_active_seconds: number | null; daily_tokens: number | null; daily_active_seconds: number | null; } | null; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; active_seconds: { limit: number | null; used: number | null; remaining: number | null; status: "ok" | "exceeded" | "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string | undefined; } | null>; quota: (query?: { days?: number; }, signal?: AbortSignal) => Promise<{ month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number | null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string | undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; } | null; }>; quotaRequests: (signal?: AbortSignal) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }[]>; createQuotaRequest: (body: { requestedCredits: number; reason?: string; }, signal?: AbortSignal) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" | "approved" | "rejected"; mode: "override" | "pack" | null; granted_credits: number | null; created_at: string; reason?: string | undefined; review_note?: string | undefined; reviewed_by?: string | undefined; reviewed_at?: string | undefined; }>; agent: (slug: string, signal?: AbortSignal) => Promise<{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; id: string; remote_agent_id: string; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; remote_agent_version?: number | undefined; resources?: { tools: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; skills: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; mcp_servers: { name: string; description?: string | undefined; permission?: "allow" | "ask" | undefined; }[]; } | undefined; memory_stores?: { name: string; description?: string | undefined; }[] | undefined; }>; sessions: (query?: SessionListQuery, signal?: AbortSignal) => Promise<{ sessions: { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]; nextPageToken: string | null; }>; sessionAgents: (signal?: AbortSignal) => Promise<string[]>; sessionDirectory: (signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; }[]>; createSession: (body: { agentSlug: string; title?: string; files?: AttachmentRef[]; }, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }>; session: (id: string, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }>; renameSession: (id: string, title: string, signal?: AbortSignal) => Promise<{ session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; usage?: { input_tokens?: number | undefined; output_tokens?: number | undefined; cache_read_input_tokens?: number | undefined; cache_creation_input_tokens?: number | undefined; } | undefined; stats?: { active_seconds?: number | undefined; duration_seconds?: number | undefined; } | undefined; remote_status?: string | undefined; files?: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[] | undefined; message_files?: { event_ids: string[]; files: { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; }[]; }[] | undefined; }>; sendMessage: (sessionId: string, body: SendMessageRequest) => Promise<{ session_id: string; accepted: boolean; event_ids: string[]; }>; toolApprovals: (sessionId: string) => Promise<{ requires_action: boolean; batch_id: string | null; pending_call_ids: string[]; requests: { batch_id: string; call_id: string; request_event_id: string | null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string | undefined; session_thread_id?: string | undefined; status?: "pending" | "submitted" | "uncertain" | undefined; result?: "allow" | "deny" | undefined; }[]; }>; submitToolApproval: (sessionId: string, decision: ToolApprovalDecision) => Promise<{ session_id: string; accepted: boolean; event_ids: string[]; }>; interrupt: (sessionId: string) => Promise<{ interrupted: boolean; }>; events: (sessionId: string, query?: EventQueryOptions) => Promise<EventsPage>; listEvents: (sessionId: string, query?: EventQueryOptions) => Promise<EventsPage>; listThreads: (sessionId: string, query?: ThreadQueryOptions) => Promise<SessionThreadsResponse>; listThreadEvents: (sessionId: string, threadId: string, query?: ThreadQueryOptions) => Promise<EventsPage>; stream: (sessionId: string, streamOptions?: StreamSessionOptions) => Promise<void>; sessionPlan: (sessionId: string, action: "archive" | "delete", signal?: AbortSignal) => Promise<{ plan_id: string; confirm_token: string; destructive: boolean; expires_at: number; diff: { resource: string; action: string; destructive: boolean; }[]; }>; archiveSession: (sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal) => Promise<{ archived: boolean; }>; deleteSession: (sessionId: string, confirmation: { plan_id: string; confirm_token: string; }, signal?: AbortSignal) => Promise<{ deleted: boolean; }>; uploadFile: (file: { name: string; bytes: Uint8Array; mimeType?: string; }, signal?: AbortSignal) => Promise<{ file_id: string; filename: string; size: number; }>; fileDownloadUrl: (fileId: string) => string; fileStatus: (fileId: string, signal?: AbortSignal) => Promise<{ file_id: string; status: string | null; available: boolean; }>; downloadFile: (fileId: string, input?: { sessionId?: string; signal?: AbortSignal; }) => Promise<Response>; }, "listEvents"> & { listEvents: ChatProvider["listEvents"]; supports(operation: ClientOperation): boolean; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `agent` | 是 | `(slug: string, signal?: AbortSignal) => Promise<{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; id: string; remote_agent_id: string; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; remote_agent_version?: number \| undefined; resources?: { tools: { name: string; description?: string \| undefined; permission?: "allow" \| "ask" \| undefined; }[]; skills: { name: string; description?: string \| undefined; permission?: "allow" \| "ask" \| undefined; }[]; mcp_servers: { name: string; description?: string \| undefined; permission?: "allow" \| "ask" \| undefined; }[]; } \| undefined; memory_stores?: { name: string; description?: string \| undefined; }[] \| undefined; }>` |
| `transport` | 是 | `{ request: <T>(path: string, init?: RequestInit) => Promise<T>; response: (path: string, init?: RequestInit) => Promise<Response>; stream: (path: string, handlers?: StreamHandlers) => Promise<void>; url: (path: string) => string; }` |
| `auth` | 是 | `{ login: (body: MemberLoginRequest, signal?: AbortSignal) => Promise<{ access_token: string; token_type: "Bearer"; expires_at: string; member: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number \| null; covered_sessions: number; }; output_tokens: { value: number \| null; covered_sessions: number; }; cache_read_input_tokens: { value: number \| null; covered_sessions: number; }; cache_creation_input_tokens: { value: number \| null; covered_sessions: number; }; active_seconds: { value: number \| null; covered_sessions: number; }; duration_seconds: { value: number \| null; covered_sessions: number; }; }; agents: { slug: string; display_name: string \| null; catalog_entry_id?: string \| null \| undefined; deleted?: boolean \| undefined; }[]; refresh_status: "idle" \| "refreshing" \| "partial" \| "failed"; completed_sessions: number; refreshed_at?: string \| undefined; } \| undefined; email?: string \| undefined; }; }>; me: (signal?: AbortSignal) => Promise<{ identity: { subjectId: string; displayName?: string \| undefined; tier?: string \| undefined; metadata?: Record<string, unknown> \| undefined; }; member?: { member_id: string; username: string; display_name: string; auth_type: "local"; status: "active"; created_at: string; updated_at: string; usage_summary?: { session_count: number; deleted_session_count: number; metrics: { input_tokens: { value: number \| null; covered_sessions: number; }; output_tokens: { value: number \| null; covered_sessions: number; }; cache_read_input_tokens: { value: number \| null; covered_sessions: number; }; cache_creation_input_tokens: { value: number \| null; covered_sessions: number; }; active_seconds: { value: number \| null; covered_sessions: number; }; duration_seconds: { value: number \| null; covered_sessions: number; }; }; agents: { slug: string; display_name: string \| null; catalog_entry_id?: string \| null \| undefined; deleted?: boolean \| undefined; }[]; refresh_status: "idle" \| "refreshing" \| "partial" \| "failed"; completed_sessions: number; refreshed_at?: string \| undefined; } \| undefined; email?: string \| undefined; } \| undefined; expires_at?: string \| undefined; }>; logout: (signal?: AbortSignal) => Promise<void>; }` |
| `config` | 是 | `(signal?: AbortSignal) => Promise<{ apiBaseUrl: string; protocolVersion: string; gateway: "sdk" \| "mock"; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; }; branding: { productName: string; logoUrl?: string \| undefined; accent?: string \| undefined; }; auth?: { mode: "member" \| "anonymous"; passwordLogin: true; } \| undefined; }>` |
| `agents` | 是 | `(signal?: AbortSignal) => Promise<{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; }[]>` |
| `plaza` | 是 | `(query?: { category?: PlazaCategory; q?: string; }, signal?: AbortSignal) => Promise<{ agents: { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string \| undefined; }; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; }[]; featured: string[]; popular: string[]; categories: { id: "data" \| "general" \| "writing" \| "coding" \| "other"; name: string; count: number; }[]; }>` |
| `usageLimits` | 是 | `(query?: { days?: number; }, signal?: AbortSignal) => Promise<{ member_id: string; month: string; reset_at: string; limits: { monthly_tokens: number \| null; monthly_active_seconds: number \| null; daily_tokens: number \| null; daily_active_seconds: number \| null; }; override: { monthly_tokens: number \| null; monthly_active_seconds: number \| null; daily_tokens: number \| null; daily_active_seconds: number \| null; } \| null; tokens: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; active_seconds: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; day_state: { day: string; reset_at: string; tokens: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; active_seconds: { limit: number \| null; used: number \| null; remaining: number \| null; status: "ok" \| "exceeded" \| "unavailable"; }; }; accounting_started_at: string; daily: { day: string; tokens: number; active_seconds: number; }[]; refreshed_at?: string \| undefined; } \| null>` |
| `quota` | 是 | `(query?: { days?: number; }, signal?: AbortSignal) => Promise<{ month: string; reset_at: string; unlimited: boolean; base_limit: number; override_limit: number \| null; packs: { id: string; month: string; credits: number; granted_by: string; created_at: string; reason?: string \| undefined; }[]; limit: number; used: number; remaining: number; per_agent: { agent_slug: string; turns: number; }[]; daily: { day: string; turns: number; }[]; pending_request: { id: string; subject_id: string; requested_credits: number; status: "pending" \| "approved" \| "rejected"; mode: "override" \| "pack" \| null; granted_credits: number \| null; created_at: string; reason?: string \| undefined; review_note?: string \| undefined; reviewed_by?: string \| undefined; reviewed_at?: string \| undefined; } \| null; }>` |
| `quotaRequests` | 是 | `(signal?: AbortSignal) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" \| "approved" \| "rejected"; mode: "override" \| "pack" \| null; granted_credits: number \| null; created_at: string; reason?: string \| undefined; review_note?: string \| undefined; reviewed_by?: string \| undefined; reviewed_at?: string \| undefined; }[]>` |
| `createQuotaRequest` | 是 | `(body: { requestedCredits: number; reason?: string; }, signal?: AbortSignal) => Promise<{ id: string; subject_id: string; requested_credits: number; status: "pending" \| "approved" \| "rejected"; mode: "override" \| "pack" \| null; granted_credits: number \| null; created_at: string; reason?: string \| undefined; review_note?: string \| undefined; reviewed_by?: string \| undefined; reviewed_at?: string \| undefined; }>` |
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
| `events` | 是 | `(sessionId: string, query?: EventQueryOptions) => Promise<EventsPage>` |
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
| `listEvents` | 是 | `((sessionId: string, options?: EventQueryOptions) => Promise<EventsPage>) \| undefined` |
| `supports` | 是 | `(operation: ClientOperation) => boolean` |


### KitErrorBody

来自 `@openagentkit/sdk/protocol`。

```ts
import type { KitErrorBody } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `error` | 是 | `{ code: ErrorCode; message: string; message_key?: string; message_params?: KitErrorMessageParams; details?: unknown; retryable?: boolean; }` |


### MemberLoginRequest

来自 `@openagentkit/sdk/protocol`。

```ts
export type MemberLoginRequest = { username: string; password: string; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `username` | 是 | `string` |
| `password` | 是 | `string` |


### MemberSessionStorage

来自 `@openagentkit/sdk/auth`。

```ts
import type { MemberSessionStorage } from "@openagentkit/sdk/auth";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `load` | 是 | `() => StoredMemberSession \| null` |
| `save` | 是 | `(session: StoredMemberSession \| null) => void` |


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


### StoredMemberSession

来自 `@openagentkit/sdk/auth`。

```ts
import type { StoredMemberSession } from "@openagentkit/sdk/auth";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `access_token` | 是 | `string` |
| `expires_at` | 是 | `string` |


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
