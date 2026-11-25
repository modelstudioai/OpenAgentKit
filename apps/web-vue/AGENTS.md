# apps/web-vue — Web / H5 体验页（Vue 3）

适用于本目录。先读[根规则](../../AGENTS.md)、[架构](../../docs/architecture.md)与
[协议](../../docs/protocol.md)。本 app 是 `apps/web` 的 Vue 3 平行实现，先做参考实现，
暂不进入发布产物。

## 职责与入口

- `src/lib/`、`src/i18n/server-error.ts`、`src/features/auth/` 下的会话存储与 Keycloak 适配器：由
  `pnpm gen:web-vue-shared` 从 `apps/web` 镜像，不手改。
- 产品文案（`auth`、`common` 命名空间）直接复用 `apps/web/src/i18n/locales`，不复制；
  本 app 只维护自己的 `workspace` 命名空间。
- `src/i18n/index.ts`：i18next 初始化与 Vue 翻译入口；Vue 特有的桥接与组件放 `src/features/`。
- `src/features/auth/`：成员登录、认证门与身份生命周期。

## 不变量

1. 继承 `apps/web/AGENTS.md` 的全部业务不变量；Vue 实现不得改变后端解析、身份隔离与限额合同。
2. 后端地址仍经宿主注入、`?api=` 与 `/api/config` 解析；浏览器只访问本端口，`/api` 由 Vite 代理。
3. 页面使用 SDK 公开数据模块与 `hooks-vue`；不另写请求、SSE 或会话状态机。
4. React 版是事实来源：共享模块只通过生成镜像同步，不手工分叉。
5. 开发端口固定 5175；默认 `pnpm dev` 包含本应用。也可用 `pnpm dev server web-vue` 只启动对应应用。

## 修改步骤

1. 先确认 `apps/web` 对应页面与共享模块；共享文件改 React 版后运行镜像生成。
2. Vue 特有逻辑放本 app，复用 chat-ui-vue 组件与 SDK hooks-vue。
3. 改身份、路由或后端解析时同步相应文档，并按 L2 合同核对 testid / role / aria。

## 验收

```bash
pnpm --filter web-vue typecheck
pnpm --filter web-vue test
pnpm check:web-vue-shared
pnpm check:architecture
```
