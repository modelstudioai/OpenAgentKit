# apps/web — Web / H5 体验页

适用于本目录。先读[根规则](../../AGENTS.md)、[架构](../../docs/architecture.md)及
[协议](../../docs/protocol.md)。本 app 是静态 CSR，同时服务桌面与移动浏览器。

## 职责与入口

- `src/lib/kit.ts`、`backend.ts`、`chat-backend.ts`：运行时配置、身份及显式后端映射。
- `src/lib/use-route.ts`：查询参数导航；`src/lib/host.ts`：应用本地宿主能力。
- `src/features/`：认证、广场、布局、聊天与用量等页面绑定。
- `src/styles.css`：主题导入与 Tailwind 扫描源；`e2e/`：Web 和 Console 的浏览器验收。

## 不变量

1. 后端地址由现有配置入口按宿主注入、`?api=` 和 `/api/config` 解析，
   不假设同源、不在组件内拼接固定服务地址。身份与完整目标地址隔离。
2. 业务调用使用 SDK 公开数据模块及各功能 hooks，不在页面另造请求、上传或会话状态机。
   `backend.ts` / `chat-backend.ts` 显式填写映射，聊天通过公开
   `createSessionEventChatProvider` 注入 `useChat`，不隐式切回默认 Kit 后端。
3. Web 与 H5 共用静态产物；不引 SSR、UA 业务分支或独立移动壳。
   断点收起的操作必须有移动入口，侧栏由公共 Layout 同时刻只挂载一份，
   会话确认弹窗保持在可访问的焦点作用域内。
4. 路由继续用查询参数：无参数为广场，`?agent=<slug>` 为聊天，
   `session=<id>` 定位会话，`?view=usage` 为用量。导航统一经 `navigate()`，
   保留深链和宿主参数，不用硬跳转清空 SPA 与认证状态。
5. 成员认证和请求生命周期复用 SDK `auth`；登录状态按服务隔离，
   退出、失效或切换身份后取消旧请求/SSE并清空该身份的消息、草稿和附件。
6. 会话与消息使用 SDK 快照和稳定 ID；切换或取消后丢弃旧代次回调。
   子 Agent 展开不丢主输入、草稿、附件或主会话状态，不把 HTTP 成功/断流当作执行完成。
7. 限额与放行由服务端决定。展示已启用指标、作用范围及错误详情，未知不能当零；
   被限额禁用时保留草稿，只在重新核对可用后恢复。绝对时间以 `Asia/Shanghai`
   转换展示，不改变服务端记账周期。
8. 主题、动效及组件复用遵循根规则；`styles.css` 显式扫描本 app 与 chat-ui 源码。
   组件滚动只作用于自己的容器，不因预览或消息更新滚动整个页面。
9. 文件选择、保存、预览、剪贴板与宿主探测留在 `host.ts`；
   注入能力逐项覆盖，缺失或保存返回 false 时保留浏览器 fallback，不进入 SDK。
   浏览器通知权限在发送这一用户手势内申请，只在当前打开会话进入 idle 终态时展示；
   不支持、被拒绝或展示失败时静默降级，不阻塞发送和会话状态。
10. 品牌读取服务端 `/api/config`，不使用构建时凭据或硬编码产品名称；
    Logo 缺失/加载失败使用现有降级。

## 修改步骤

1. 先确认 SDK 已有的数据流程与 chat-ui 组件，页面只保留绑定、路由和 UI 状态。
2. 跨层行为同步接口、协议或架构文档，组件 API / 示例调整同步生成链路。
3. 选择能观察实际变化的单测或浏览器用例，验证取消、身份隔离与失败恢复；
   不在 hooks 测试重复 Provider 映射。

## 验收

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm check:architecture
pnpm check:docs
```

交互变化选择 `pnpm e2e` 的相关 desktop / mobile 用例；认证、用量和布局的专项配置
以 `playwright*.config.ts` 为准。E2E 的默认匿名 Mock 场景不能替代成员登录或 live 验收。
`e2e/fixtures.ts` 将非法交互嵌套警告视为失败；文档文字变化按根规则验证。
