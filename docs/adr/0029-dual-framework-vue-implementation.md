# ADR-0029：Web 体验提供 Vue 3 平行实现

## 背景

SDK 的 Chat Controller、Store、重连、查询状态与协议本来就与 UI 框架无关，React 适配面只有
约 600 行；而 `packages/chat-ui` 与 `apps/web` 是 React 实现，Vue 使用方无法复用成品组件与
体验页。Vue 侧需要决定是包装 React、嵌入 iframe，还是平行实现一套。

## 决策

1. SDK 增加按功能归属的 Vue 适配目录 `hooks-vue/`，公开入口与 React 对称
   （`/auth/hooks-vue`、`/chat/hooks-vue` 等）；Vue 仅允许出现在这些目录与
   `providers/kit/vue/`，数据入口禁 Vue。
2. 新增 `packages/chat-ui-vue` 与 `apps/web-vue`，按 React 版逐组件、逐页面平行实现；
   不包装 React 组件，不做 React 岛。
3. 两套实现按 **L2 等价**验收：`data-testid`、`role` 与可访问名、`aria-*`、表单元素类型、
   语义类名一致；DOM 层级、prop 名、组件拆分不要求一致。
4. React 版是唯一事实来源。公开注入点使用同名插槽：内容型为具名插槽，覆盖型为同名
   作用域插槽，命令式 API 用 `defineExpose`。
5. React 优先：新功能先落后 React 版，Vue 版跟随同步；不允许为迁就 Vue 修改 React 的
   DOM 合同或行为。
6. `web-vue` 分阶段交付：先做参考实现并通过体验类 E2E，达标后再决定是否进入
   `build-release`；文档站与 Console 不提供 Vue 版。
7. 与框架无关的资产采用单一来源：产品文案直接复用 `apps/web/src/i18n/locales`；
   `theme.css`、组件词典与纯 DOM 算法用生成镜像 + 一致性校验。

## 理由

- 数据层已框架无关，平行实现只重写视图，不会出现第二套 SSE、重连或快照逻辑。
- 包装 React 无法提供可 copy-in 的 Vue 组件与主题定制，iframe 无法满足组件复用。
- L2 允许两套应用共用同一批 Playwright 用例，把漂移变成测试失败而不是口头约定。
- 单一文案来源与生成镜像把“两份必然不同步”压缩到可机械校验的范围。

## 后果

- UI 变更新增一次 Vue 侧落地成本；每次 chat-ui 变更需要在 Vue 包同步并跑 parity。
- SDK 公开入口从 7 个 hooks 增加到 14 个（含 Vue）。
- 新增构建链：`chat-ui-vue` 使用 Vite library + `vue-tsc`，与 `chat-ui` 的 tsup 不同。
- Biome 对 `.vue` 只能检查 `<script>`；模板级规则需另接 ESLint（尚未启用）。

## 备选方案

- **只提供 hooks-vue**：成本最低，但无法交付成品组件与体验页。
- **React 岛 / 微前端**：复用同一实现，但不是真正的 Vue 组件，copy-in 与定制受限。
- **iframe 嵌入现有 Web**：只能解决“能看”，不能复用组件。

均不满足“Vue 团队拿到与 React 对等的组件与体验页”的目标。
