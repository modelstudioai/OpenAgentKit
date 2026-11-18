# 消息转换

SDK 将百炼原始 SSE 归一为 `SessionEvent` 快照。Provider 的 `transformMessage` 将这些已归一的
快照转换为 Kit 的展示数据 `ChatMessage`。两个内置 Provider 工厂都显式使用公开的
`transformSessionEvent` 作为默认策略，该策略无需 SDK 运行时。

`MessageTransformer` 接收 `{ messages, event, identity }`，返回 `{ messages, artifacts? }`。
`messages` 是本次重建中当前线程的临时数组，策略可原地修改或返回新数组。
`identity` 由 Chat 分配，在快照替换后保持稳定。委托给其他策略时，须保留它以及消息 ID、
分片 ID 和对账字段。

Chat 持有事件账本，使用最新快照重建消息，对每个事件调用策略并持有返回的数组。
Provider 只定义转换规则，勿在闭包中留存消息、修改事件或跨重建过程保留累计缓存。
一个 Provider 可供多个会话使用。同 ID 快照可能替换或清空内容，reset 也可能完全移除事件，
转换需支持这些情况。

[message-transform.ts](../examples/message-transform.ts) 包装默认策略，幂等地替换展示标签。
示例返回新数组，同时保留 ID、状态、工具数据和产物。每个后端绑定只构造一次包装。
所有网络方法仍在原实例上调用，保留原型方法及其 `this` 绑定。
若要包装另一套自定义策略，先明确两套展示规则如何组合。

Chat 负责执行阶段、待审批项、乐观消息、对账和重连。隐藏状态分片或修改文本只影响展示。
UI 组件继续使用相同形状的 `ChatMessage`。

该属性可选，兼容已有的五方法 Provider 或 KitClient。省略时使用 `transformSessionEvent`。
直接使用 Store 的调用方可通过 `createSessionStore(sessionId, { transformMessage })` 注入同一策略。
使用 Hook 时，在 Provider 上配置策略，由 Chat 持有 Store。
