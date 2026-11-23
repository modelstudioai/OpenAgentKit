# 标准事件接入

后端已将百炼事件转换为 SDK `SessionEvent` 快照时，使用 `createSessionEventChatProvider` 及其公开控制帧合同。
把已归一的事件交给原始流工厂会造成输入合同不匹配，并可能重复累加内容。

[normalized-provider.ts](../examples/normalized-provider.ts) 是完整示例。自建后端从
`/sessions/:id/events` 返回升序快照分页，从 `/sessions/:id/events/stream` 返回实时 SSE。
示例显式发送 `x-kit-protocol-version` 请求头，服务端需接受该头。
工厂通过注入的 RequestClient 建立可取消的订阅，并执行独立的历史分页及四个业务操作。
路径、方法、身份请求头和 JSON 响应包装由应用配置，工厂不会自动添加协议头。

默认 30 秒内须就绪，45 秒内须收到有效帧。沿用这套读取与重连机制，写请求禁止自动重试。
四个非流式操作与原始流示例使用同样的 RequestClient 配置。
默认消息转换为 `transformMessage: transformSessionEvent`。Chat 在重建消息时调用策略并持有消息。
自定义展示见[消息转换](message-transform.md)。

标准事件接入必填 `listEvents`。它返回 `EventsPage`，使用不透明的 `next_page_token`。
Controller 在实时订阅就绪后分页，同时缓冲实时更新，合并后一次性更新消息。

实时后端按以下规则发送帧。

1. 首次订阅就绪发 `ready`。有效的 `after` 先补发实时更新，游标失效时发 `reset → ready`。
2. 持续发送实时 `event` 快照及 `ping` 帧。
3. 明确结束传输时发送 `done`，流故障时发送 `error`。

实现此传输格式时使用协议的 `SseFrame` 和 `encodeFrame`。在 SSE `id` 中保留不透明的更新游标。
后端校验 `after` 并重放更新，游标过期时重置。同一业务事件更新时，重放游标也必须前进。

后端采用其他事件包装或传输方式时，可实现 `ChatProvider` 并映射
`StreamSessionOptions` 回调。采用纯实时订阅时同时提供 `listEvents`。
仅将对应的 Kit 格式交给 `decodeFrame`，业务事件沿用 SDK 类型。

Web 同样通过该公开工厂连接 Kit Server，配置 `/api/kit/sessions` 路径和 `{ data }` 包装。
独立示例使用 `/sessions` 和 `{ result }`。已有 KitClient 应用可继续使用 `createKitChatProvider`
或 Context 入口，见[兼容示例](../examples/kit-client-provider.ts)。
