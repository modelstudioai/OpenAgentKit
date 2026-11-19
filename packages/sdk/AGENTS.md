# packages/sdk — 数据 SDK 与共享协议

适用于本目录。先读[根规则](../../AGENTS.md)、[架构](../../docs/architecture.md)、
[协议](../../docs/protocol.md)和 ADR-0025/0026。
公开面以 package exports、构建入口与 Skill API 模块表的一致结果为准。

## 职责与入口

- `chat/`、`sessions/`、`files/`、`agents/`、`usage/`、`auth/`：功能实现及就近 hooks。
- `stream/`、`request/`、`providers/`：分帧、HTTP 与后端合同。
- `messages/`：纯展示转换；`protocol/`：共享 DTO、Schema、帧与事件合同。
- `config/`、`state.ts`：宿主配置与通用状态；`hooks/`：通用 React 内部工具。
- `providers/kit/react/`：Kit Context 及 Client 解析。完整导入映射见目录规则。

## 不变量

1. 数据入口能在浏览器、Node 与 WebView 使用，禁止 React、DOM 和 Node-only API。
   宿主文件选择、保存、剪贴板、object URL 等交互留在应用；配置只经受守卫的配置入口读取。
2. 保持 Stream → Request → Provider → Chat 的单向依赖：
   Stream 只解码/分帧，Request 负责 HTTP，Provider 解释后端就绪与事件并提供转换策略，
   Chat 持有 ledger、消息和会话编排；低层不依赖高层，Chat 核心不反向依赖 Composer。
3. `messages/` 只做纯转换，不依赖 Chat、网络或上游 SDK 运行时；
   Provider 的转换策略不缓存跨会话状态，Chat 调用策略并拥有转换结果。
4. 按 `event_id` upsert 累计快照，不重复 append；稳定消息/分片 ID 保持 UI 身份。
   传输 cursor 独立用于 `after`，不能与业务 ID 混用；控制帧不进入事件 ledger。
5. reset 到 ready 原子重建 Provider 集合，乐观 overlay 独立保留；
   取消、切会话和新代次隔离旧回调。Turn 以主会话 Provider 状态及回显证据为准，
   单条消息完成、子线程结束、done、EOF 或 interrupt HTTP 成功都不能替代业务完成。
6. `createSseStream` 的自然 EOF 可正常结束；持续订阅意外断流由 Provider 报告可恢复错误。
   取消/超时释放 reader，重连只恢复观察，不自动重发消息、审批或其他业务写入。
7. 通用 Request 不隐式添加 Kit 协议头、重试或超时。Kit 默认行为留在
   `providers/kit`；显式 Client 的 operations 缺失时拒绝调用，不回退隐藏路径。
8. `state.ts` 只保存通用查询/写入/订阅状态，不依赖业务请求和应用。
   AdminClient、成员用量与 Operation 业务恢复属于 Console，不新增 SDK 管理入口。
9. React 仅位于六个功能的 `hooks/`、通用 `src/hooks/` 和 `providers/kit/react/`，
   作为可选 peer 使用。功能 hooks 管理订阅/生命周期，不另造业务请求实现。
   通用 hooks 的仓库内依赖只限自身、state、protocol、internal；
   Kit React 接入仅依赖 Kit 自身，不带入其他 Provider 或功能流程。
10. `/hooks` 只公开屏幕判断，Kit React 入口只公开现有 Context 能力；
    生命周期、订阅、可选 Context 及 Client 解析工具保持内部使用。
    不恢复根入口、旧 React 聚合或已移除别名。
11. `protocol/` 只依赖协议自身，不带入 SDK 功能、应用或 UI；
    上游 SDK 只允许 type-only 主入口与浏览器安全事件子路径。
    服务端确认令牌、身份与私密实现不能下沉。运行时 Schema 与生成类型分工保持清晰。
12. 仅显式 `/providers/bailian` 加载原始百炼转换依赖；其他功能不能暗中带入。
    `sessions/load-directory.ts` 保持 protocol/internal 叶子边界，
    Client 不经会话聚合入口反向载入工作流。

## 修改步骤

1. 先确定功能与状态所有权，在无 React 的模块实现流程；只有通用生命周期进入通用 hooks。
2. 变更转换保护展示与身份规则；Provider HTTP/SSE 合同在所属 gateway 层测试，
   上层 Controller / hooks 不重复叶子映射。
3. 新公开 API 必须有真实消费方；同步 exports、tsup 入口、Skill catalog 与可编译示例，
   不为单个应用的页面 hook 扩大公共面。
4. 共享 Schema 或后端 op 变化同步接口并运行 `pnpm gen:openapi`；
   重连、去重或生命周期变化同步协议。API/示例调整运行 `pnpm gen:skills`。
5. 私有辅助逻辑不从 barrel 泄漏；迁移文件同时移动相应测试，不保留平行实现。

## 验收

```bash
pnpm --filter @openagentkit/sdk typecheck
pnpm --filter @openagentkit/sdk test
pnpm check:architecture
pnpm check:docs
```

按变化选择 Stream/Request、Provider、Controller、快照、重连及浏览器入口合同。
依赖规则的精确匹配以根 `.dependency-cruiser.cjs` 为准；
公开类型/示例变化还需 `pnpm typecheck:skills` 和 Skill 验证。规范文字变化按根规则验证。
