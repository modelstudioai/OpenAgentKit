# 标准事件接入

后端已将百炼事件转换为 SDK `SessionEvent` 快照时，使用 `createSessionEventChatProvider` 及其公开控制帧合同。
把已归一的事件交给原始流工厂会造成输入合同不匹配，并可能重复累加内容。

[normalized-provider.ts](../examples/normalized-provider.ts) 是完整示例。自建后端从
`/sessions/:id/events/stream` 返回 Kit 的公开 SSE 控制帧，服务端可用任意技术栈实现。
示例显式发送 `x-kit-protocol-version` 请求头，服务端需接受该头。
工厂通过注入的 RequestClient 建立一条可取消的订阅并执行四个 HTTP 操作。
路径、方法、身份请求头和 JSON 响应包装由应用配置，工厂不会自动添加协议头。

默认 30 秒内须就绪，45 秒内须收到有效帧。沿用这套读取与重连机制，写请求禁止自动重试。
四个非流式操作与原始流示例使用同样的 RequestClient 配置。
默认消息转换为 `transformMessage: transformSessionEvent`。Chat 在重建消息时调用策略并持有消息。
自定义展示见[消息转换](message-transform.md)。

示例后端按以下顺序发送帧。

1. 需要完整重建时发送 `reset`，并携带会话 ID。
2. 发送 `event`，携带完整的 SDK `SessionEvent` 快照。
3. 在历史和实时事件完成对账后发送 `ready`。
4. 持续发送 `event` 更新及 `ping` 帧。
5. 明确结束传输时发送 `done`，流故障时发送 `error`。

实现此传输格式时使用协议的 `SseFrame` 和 `encodeFrame`。在 SSE `id` 中保留不透明的更新游标。
后端校验 `after` 并重放更新，游标过期时重置。同一业务事件更新时，重放游标也必须前进。

后端采用其他标准事件包装或传输方式时，沿用五方法 Provider，并将传输映射到
`StreamSessionOptions` 回调。回调合同可独立于上述帧名使用。
仅将对应的 Kit 格式交给 `decodeFrame`，业务事件沿用 SDK 类型。

Web 同样通过该公开工厂连接 Kit Server，配置 `/api/kit/sessions` 路径和 `{ data }` 包装。
独立示例使用 `/sessions` 和 `{ result }`。已有 KitClient 应用可继续使用 `createKitChatProvider`
或 Context 入口，见[兼容示例](../examples/kit-client-provider.ts)。
