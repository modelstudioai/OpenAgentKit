# 百炼原始 SSE 接入

参考 [raw-bailian-provider.ts](../examples/raw-bailian-provider.ts) 及其 [HTTP 辅助模块](../examples/backend-http.ts)。
工厂接收 `RequestClient` 和六个操作配置，包含 `openStream`、`listEvents` 及四个非流式 ChatProvider 方法。
前两个共同实现公开的 `stream` 方法。每个操作均有 `buildRequest(input, context)` 和
`mapResponse(response, context)`。`buildRequest` 返回 `{ path, init? }`，`mapResponse` 返回操作结果。
Provider 执行 HTTP 请求，并将原始 `input` 与取消上下文提供给响应映射。

## 后端确认订阅就绪

`openStream.mapResponse` 返回 `{ response, ready }`。`ready: Promise<void>` 表示上游实际已经订阅。
空闲会话需要在首次发送前进入就绪状态，禁止等待第一条业务事件才确认就绪。

示例后端会先建立百炼订阅，再在响应头中返回 `x-upstream-ready: true`。跨域请求通过
`Access-Control-Expose-Headers` 暴露该响应头。缺少这一信号时，适配器拒绝连接。
在该保证下，才可用已完成的 Promise 表示就绪。HTTP 200 或订阅建立前写出的响应头都无法证明就绪。

`mapResponse` 应立即返回响应体与 Promise，让工厂在等候 ready 时开始缓冲。
响应映射阶段不读取 SSE 正文，也不等待 ready。映射失败或取消时关闭响应，
包括因请求实现忽略取消而迟到的响应。

也可使用独立信号完成握手。信号必须标识本次订阅，失败时拒绝，并支持通过传入的 signal 取消。
缓存的会话存在性结果或健康检查不能用作订阅就绪信号。

## 历史与恢复

工厂会立即读取并缓冲事件流，等到上游就绪后，按升序读取所有历史页。
`listEvents.mapResponse` 返回完整原始对象和不透明的 `nextPageToken`，
游标为 `null` 或缺失时结束分页。保留 ID、创建时间、生命周期信息、内容和主会话状态。

工厂将历史和缓冲帧交给 SDK 归一器，发出 reset 并重建后再报告 ready。
历史必须包含判断执行状态与待审批项所需的信息，禁止静默截断或在状态未知时填为 idle。

同 ID 的快照可能变化。历史与实时快照冲突且没有更新依据时，工厂可以拒绝接入。
`created_at` 只表示创建时间。遇到无法匹配的 `object: "content"` 帧时，不能通过丢弃来让连接就绪。
同一次实时连接内保留到达顺序，包括同 ID 的状态更新。

每次重连重新读取完整历史。此路径没有百炼逐更新游标，不能转发 Kit `after`、SSE `id` 或最后一条业务事件 ID 来代替。
进行中的历史快照缺少可靠的增量水位。恢复后可能暂时只显示部分内容，直到收到完整权威快照。

## 上限与清理

| 配置项 | 默认值 |
| --- | --- |
| `connectTimeoutMs` | 30000 |
| `idleTimeoutMs` | 45000 |
| `maxBufferedFrames` | 1024 |
| `maxBufferedBytes` | 8388608 |
| `maxHistoryEvents` | 10000 |

超过上限时明确失败。订阅和历史操作接收 `context.signal`，`init` 不得覆盖它。
连接总时限涵盖请求构建、动态鉴权、HTTP、响应映射、订阅就绪和历史。
工厂统一取消 reader、定时器、历史请求和缓冲事件交付，控制器负责安排重连。
回合结束后持久订阅保持打开。自然 EOF 或流静默视为故障，禁止伪造 OpenAI `[DONE]` 帧。

Kit 管理分帧和恢复，SDK 管理百炼事件的累加与转换。
Kit 显式传入 `{ redact: false, truncate: false }` 以保留完整内容，SDK 默认设置仍按原合同使用。
复用现有归一器，展示时用完整快照替换内容。

## SDK 公开入口

本仓库使用已发布的 npm 包 `@openagentpack/sdk`，固定版本为 `0.10.0`，
包内容由 `pnpm-lock.yaml` 中的完整性摘要锁定。可在浏览器使用的 `@openagentpack/sdk/session-events`
导出 `SessionEvent` 和 `createBailianSessionEventNormalizer`。
服务端入口提供 `listSessionThreads` 和 `listSessionThreadEvents`。
修改依赖时重新核对公开导出，并运行相关合同测试与浏览器打包测试。
真实后端与 Cloud 需独立验收。只使用 SDK 公开入口，仓库内禁止提交开发机路径。
