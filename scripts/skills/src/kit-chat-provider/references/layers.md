# Stream、Request、Provider 与 Chat

按任务所需选择最底层的入口。这些公开 API 可独立于 UI 组件和 Kit Server 使用。

| 层 | 公开 API | 职责 |
| --- | --- | --- |
| Stream | `@openagentkit/sdk/stream` 的 `createSseStream` | 解码字节、输出原始 SSE 字段、取消并释放 reader |
| Request | `@openagentkit/sdk/request` 的 `createRequest` | 解析 URL 和身份头，执行 HTTP 请求并返回 Response、JSON 或原始帧 |
| Provider | `ChatProvider`、`createSessionEventChatProvider`、`createKitChatProvider`、`createBailianChatProvider`、`transformSessionEvent` | 映射后端操作、历史和就绪信号，定义事件到消息的转换 |
| Chat | 核心层的 `createChatController` 和 React 的 `useChat` | 持有事件账本和消息，调用 Provider 策略，管理乐观状态、重连及操作 |

核心聚合入口也导出 Stream 和 Request。两者的独立入口无需 React 或 SDK 归一器。
百炼专用入口使用 SDK 的浏览器转换工具。默认消息转换为纯函数，无需 SDK 运行时。
策略的输入、所有权和快照规则见[消息转换](message-transform.md)。

已有响应体时参考 [sse-stream.ts](../examples/sse-stream.ts)。迭代器将 `data` 保留为字符串。
默认 `utf8Fatal=false`、`flushOnEnd=true`，`maxFrameChars` 默认无上限。
`onComment` 报告心跳注释。取消、解析失败或提前 `break` 都会释放 reader。
`SseStreamError` 表示解码或分帧失败，读取错误保留传输层语义。自然 EOF 仅表示流结束。

独立的 HTTP 与 SSE 用法见 [request.ts](../examples/request.ts)。Request 由调用方配置超时、重试、
Content-Type 和 Kit 协议头，默认均不添加。`response` 将响应体交给调用方。`json<T>` 只解析 JSON，
HTTP 204 返回 `undefined`，业务 Schema 须另行校验。`stream` 委托 Stream 并清理 reader。
单次请求的请求头覆盖动态请求头。`mapHttpError` 可以构造安全的应用错误，避免泄漏凭据或任意响应体。

Web 通过 `createSessionEventChatProvider` 接入 Kit Server，显式配置路径、请求头和响应映射。
已有 KitClient 的应用在内部使用 `createTransport`，由其补齐 Kit 协议头、解析控制帧和错误，
并维护有效帧超时。

百炼原始流使用 Request 和六个操作配置。Provider 管理订阅和历史请求的取消以及 ready 信号，
重连只由控制器调度。消息与工具审批写入均通过一次显式请求完成。
