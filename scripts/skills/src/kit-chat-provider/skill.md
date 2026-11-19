# 接入 Kit 对话后端

使用本 Skill 在已有业务后端与 Kit 对话控制器之间编写前端适配。上游仍是百炼托管 Agent。
适配层的职责限于连接现有后端、映射响应及订阅生命周期。

## 选择接入方式

| 现有后端 | 实现 |
| --- | --- |
| 返回标准 SDK `SessionEvent` 快照和控制帧，例如 Kit Server | 配置 `createSessionEventChatProvider`，参考[标准事件接入](references/normalized-events.md) |
| 返回标准快照，但采用其他传输方式 | 实现 `ChatProvider` 的五个方法并映射生命周期回调 |
| 转发百炼原始 SSE | 使用 `@openagentkit/sdk/providers/bailian` 的 `createBailianChatProvider`，参考[原始 SSE 接入](references/raw-sse.md) |

Web 应用与自建后端共用同一套公开配置。已有 KitClient 的应用可以继续通过 Context 接入，
也可以使用[兼容封装](examples/kit-client-provider.ts)。

先核对真实的请求、响应、就绪信号和历史合同。事件需要可识别的身份和执行状态，只有文本片段无法满足合同。
原始流工厂使用持久订阅和独立的发送请求。若 POST 仅返回本次响应流，需按该传输方式单独设计适配器。

## 接入步骤

1. 对照[接入合同](references/contract.md)核实后端能力。会话创建、列表和文件操作由 ChatProvider 之外的调用方负责。
2. 使用运行时 base URL 和应用鉴权头创建一个 `RequestClient`。通过 `buildRequest` 和
   `mapResponse` 配置各 HTTP 操作，由 Provider 执行请求。阅读[四层职责](references/layers.md)，
   查阅[可编译示例](references/examples.md)和 [API 参考](references/api.md)。示例路由和响应包装仅用于演示业务合同。
3. 保持 Provider 实例稳定，并传给 `useChat({ sessionId, provider })`。ID 为 `null` 时延后订阅。
   消息转换默认复用 `transformSessionEvent`，有展示需求时再自定义 `transformMessage`。
   参考[消息转换](references/message-transform.md)。
4. 按真实后端合同验证空闲会话能否就绪、完整历史和实时事件重叠时的合并、同 ID 更新、
   请求取消及工具审批结果。
5. 接入多 Agent 时，可增加线程查询并将 `chat.multiAgent` 传给 `Chat`。
   标准快照后端和百炼标准 API 预设均可参考[共享示例](examples/multi-agent.tsx)。
   线程状态复用 SDK 实现。

Provider 定义消息转换规则。Chat 根据最新事件账本重建并持有消息，控制器负责编排重连、
乐观消息和工具审批。每次 Provider `stream` 调用只管理一条连接。保持单一重试循环，
消息和审批的 POST 由显式操作发起，禁止自动重发。

已有字节流时使用 `createSseStream`，独立 HTTP 或 SSE 请求使用 `createRequest`。
Stream 将帧数据保留为文本。Request 可解析 JSON 语法，业务 Schema 校验归调用方。
订阅就绪与会话状态由上层管理。原始流工厂接受 Request 和六个操作配置，
每个请求通过对应的操作配置接入。

## 职责与依赖

复用 SDK 的 `SessionEvent` 合同与公开的事件归一工具。保留快照语义，勿复制 SDK 的累加器、
把快照当作增量拼接或导入 SDK 的 `internal/*` 路径。浏览器运行时通过 SDK 的 `session-events`
入口访问事件能力。Provider 凭据保留在后端，前端请求只携带应用身份。

本仓库使用已发布的 npm 包 `@openagentpack/sdk`，固定版本为 `0.10.0`，
包内容由 `pnpm-lock.yaml` 中的完整性摘要锁定。`@openagentpack/sdk/session-events` 可在浏览器使用，
提供 `SessionEvent` 和 `createBailianSessionEventNormalizer`。
服务端入口提供 `listSessionThreads` 和 `listSessionThreadEvents`。
升级依赖时，检查解析到的公开导出并运行相关合同测试和浏览器打包测试。
真实后端和 Cloud 接入需独立验收。集成现有后端时沿用已发布的 SDK 与默认配置。
