# 前后端接入合同

`ChatProvider` 有五个必需方法。复用 Kit 的公开事件和审批类型，确切声明见 [API 参考](api.md)。
Provider 也可接收可选的 `transformMessage` 策略，两个内置工厂均使用 `transformSessionEvent`。
自定义展示时参考[消息转换](message-transform.md)，五个网络方法保持同一合同。

多 Agent 历史通过两个可选操作接入。`listThreads` 返回 `SessionThreadsResponse`，
`listThreadEvents` 返回 `EventsPage`，查询选项包括 `limit`、`pageToken` 和 `signal`。
每页事件按时间升序排列，下一页游标指向更早的历史。保留所属线程 `metadata.thread_id`，
事件中提及其他 Agent 不改变其归属。
缺少线程历史查询时，子视图只能展示主订阅已交付的事件。把 `multiAgent={chat.multiAgent}` 传给
`Chat` 可展示内联只读子卡片。展开卡片时按需加载历史，支持加载更早的记录和重试失败的查询。

对于百炼原始响应，`createBailianThreadOperations({ basePath? })` 提供
`/api/v1/agentstudio/sessions/:sessionId/threads` 下的两个标准 GET 路径，
映射 `limit/page` 与 `{ data, next_page }`，并反转倒序事件页。
代理使用自定义路径或包装结构时覆盖对应操作配置。每页线程历史使用独立的 SDK 归一器，
不会重置会话流。两种 Provider 路径及 Chat 接线见 [multi-agent.tsx](../examples/multi-agent.tsx)。

| 方法 | 必需行为 |
| --- | --- |
| `stream(sessionId, options)` | 通过一条持久、可取消的订阅交付 SDK `SessionEvent` 快照和生命周期回调 |
| `sendMessage(sessionId, body)` | 提交文本与 `client_message_id`，返回真实的 `session_id`、`accepted` 和 `event_ids` |
| `interrupt(sessionId)` | 请求中断远端执行，返回 `{ interrupted }` |
| `toolApprovals(sessionId)` | 查询当前待审批批次和调用，返回完整的冻结参数 |
| `submitToolApproval(sessionId, decision)` | 提交一次真实的允许或拒绝决定，返回受理结果和事件 ID |

五个方法都需要真实的后端能力。若后端缺少中断或审批等操作，指出缺失项，避免用空实现或伪造的成功结果掩盖问题。

## 订阅生命周期

- `onReset()` 开始完整重建。交付所有权威快照后再调用 `onReady({ sessionId, replayed, cursor? })`。
- `onEvent(event, cursor?)` 交付一个 SDK `SessionEvent`。同一 `event_id` 的新快照替换已有正文，
  保留显式空值。
- `onPing(t)` 报告传输仍活跃，心跳不进入业务事件集合。
- `onDone({ status, lastEventId })` 报告传输已明确结束。主会话的执行结果由业务状态决定。
- 遇到意外 EOF、超时或网络故障时拒绝，使用 `KitError.retryable` 区分可恢复故障与鉴权或合同错误。
- 将 `options.signal` 传给实际网络请求。取消后关闭 reader 并停止待执行的回调，重连由 Chat 控制器管理。

只有后端提供真正的不透明更新重放游标时，才使用 `options.after` 和回调游标。`event_id` 标识业务事件，
用它续传会丢失同一事件的后续快照。缺少重放游标时，声明 reset 并重建完整历史。

`session_status` 决定执行状态。`idle` 同时带 `requires_action` 时，当前回合暂停等待工具审批。
主回合的结束由主会话状态决定。保留陌生的事件类型和内容块，供 UI 安全兜底展示。

## 应用职责

从传入的运行时配置解析 URL，支持页面与后端不同源。示例的 `getAppToken` 只提供应用身份。
百炼 API Key、Vault 凭据和 SDK 服务端配置保留在后端。
默认 Kit Server 要求本地成员登录，除非服务端显式开启匿名模式。成员认证控制器为每次登录持有固定令牌的
Client，并在退出或过期时取消仍在等待响应头或读取响应体的旧请求。即使自定义 fetch 忽略信号，也会结束等待并
释放迟到的响应体。超时和重试由调用方配置。自建后端沿用自己的认证合同，无需提供 Kit 本地成员端点。
旧身份的请求始终绑定原身份，公开配置探测不携带凭据。

创建和列出会话、上传、挂载及下载分别调用独立接口。创建后把真实会话 ID 传给 `useChat`。
默认的 `useSessions` 仍使用 KitClient。

消息与审批决定只发送一次。浏览器请求失败时，后端可能已经受理。保留请求标识供后续对账，
先刷新当前状态，再等待用户明确发起下一次操作。

后端必须检查会话归属、当前审批批次与调用，以及是否已有回复。浏览器确认用于辅助交互。
拒绝某个工具调用只影响该工具，停止整个会话须发起独立中断操作。

默认 Kit Server 的成员用量和受保护的删除属于独立资源操作。服务端从 SDK
`getSession().attributes` 读取累计数字用量。删除本地成员的体验会话前，须停止执行并持久化用量快照。
等待工具审批的空闲会话仍处于未完成状态。删除后保留数字快照，事件正文由 Provider 持有。
自建后端沿用自身的统计与删除合同，Kit 成员管理由 Console 负责。

## HTTP 辅助示例

[backend-http.ts](../examples/backend-http.ts) 实现应用鉴权、安全的 HTTP 错误、响应校验和四个非流式方法。
两个 Provider 示例均从本地导入它，使用时复制整个示例目录。文件中的 `{ result }` 响应包装和
`/sessions/...` 路径用于演示，按真实后端调整映射并沿用 Kit 公开类型。
