# packages/chat-ui-vue — Chat 产品组件（Vue 3）

适用于本目录。先读[根规则](../../AGENTS.md)、[架构](../../docs/architecture.md)与
[目录规则](../../docs/repository-layout.md)。本包是 `packages/chat-ui` 的 Vue 3 平行实现，
不是包装层。

## 职责与入口

- `src/components/<component>/index.vue`：与 React 版同名的组件；文案与主题镜像自 chat-ui。
- `src/index.ts`：公开导出；`registry.json`：copy-in 入口、文件与依赖闭包。
- `src/theme.css`、各组件 `strings.ts`：由 `pnpm gen:chat-ui-vue` 从 chat-ui 生成，不手改。

## 不变量

1. 与 React 版 L2 等价：`data-testid`、`role` 与可访问名、`aria-*`、表单元素类型与语义类名一致；
   DOM 层级与内部实现可不同。
2. React 版是唯一事实来源。不允许 import `@openagentpack/kit-chat-ui`、React 或 Radix React。
3. 组件不请求业务接口、不持有 Provider 凭据；数据与动作由 SDK hooks-vue 或回调注入。
4. 主题与文案只消费生成镜像；不新增设计常量，不手改 `src/theme.css`、`strings.ts`。
5. 公开注入点使用同名插槽：内容型为具名插槽，覆盖型为同名作用域插槽，命令式 API 用 `defineExpose`。

## 修改步骤

1. 先改 React 版对应组件或其同名数据，再移植；纯 DOM 算法与纯计算抽到框架无关模块镜像。
2. 新增组件同步 `src/index.ts`、`registry.json` 和本文件职责说明。
3. 运行 `pnpm gen:chat-ui-vue`，再跑类型检查、单测与相关 E2E。

## 验收

```bash
pnpm --filter @openagentpack/kit-chat-ui-vue typecheck
pnpm --filter @openagentpack/kit-chat-ui-vue test
pnpm check:chat-ui-vue
pnpm check:architecture
```
