---
name: react-to-vue
description: 按 L2 等价标准把本仓库的 React 组件或页面移植到 Vue 3，并同步 React 优先的后续功能增量。用于 chat-ui→chat-ui-vue、web→web-vue 的逐组件迁移与回归；不用于改动 React 版本身、新建设计系统或仓库外的通用 React/Vue 转换。
metadata:
  short-description: React 组件移植到 Vue
---

# React → Vue 移植

本 Skill 服务 OpenAgentKit 的 Vue 3 平行实现。它假设 React 版是事实来源，Vue 版是单向镜像，
目标是让两套实现能跑同一批浏览器用例，而不是让源码长得一样。

开始前先读：根 `AGENTS.md`、`docs/architecture.md`、`packages/chat-ui/AGENTS.md`、
`apps/web/AGENTS.md`。组件与页面的业务不变量以这些文件为准，本 Skill 不重复定义。

## 三条硬约束

1. **React 先行。** React 版新增或修改功能后，Vue 版跟随补齐；不要为了迁就 Vue 去改 React 的
   行为、API 或 DOM 合同。发现 React 版本身有问题时单独提出来，不在移植里顺手改。
2. **L2 等价。** 两套实现必须一致的是：`data-testid`、`role` 与可访问名、`aria-*`、
   表单元素类型（例如 Sender 必须仍是 contenteditable）、语义类名（`kit-*`、`max-md:hidden`、
   `sr-only`）。不要求一致的是：DOM 嵌套层级、包装元素、prop 名、事件名、内部组件拆分。
3. **同名插槽。** React 的内容型 `ReactNode` prop → 同名具名插槽；组件覆盖型 prop
   （如 `Sender.components`）→ 同名作用域插槽；`forwardRef` 命令式 API → `defineExpose`
   同名方法。语义对齐即可，不强求模板写法一致。

## 移植流程

### Step 0：先分类，再决定是否“抽出来共用”

逐个组件判断，不要一上来就写模板：

| 类型 | 判断依据 | 处理 |
| --- | --- | --- |
| 纯计算 | 不碰 DOM、不读 React 状态（如 `rowOffsets`、`windowSlice`） | 抽到框架无关模块，两边 import |
| 纯 DOM 算法 | 只操作 DOM 节点/选区（如 `serializeEditable`、`textOffsetAt`） | 抽到框架无关模块，两边 import |
| 纯数据 | 词典 `strings.ts`、`theme.css` | 生成镜像 + 一致性校验，绝不手抄 |
| 纯展示 | 只有 props → 标记，无本地状态 | 直接平移 |
| 有状态/时序 | 本地 state、effect、ref、滚动、焦点 | 按“高危组件清单”逐条处理 |

判断标准是“抽出来是否两边都能直接用”。只在 React 内部有意义的 hook 不要抽；
需要把两框架差异压进自研抽象的，不做。

### Step 1：建 Vue 骨架

- `interface Props` → `defineProps<Props>()`；默认值集中在 `withDefaults`，不要散落在模板。
- `onX` 回调按语义选择：宿主事件（发送、停止、选择）用 `defineEmits`；需要把回调透传给
  第三方或保留引用语义的，用同名 prop。
- `children` → 默认插槽；具名 `ReactNode` prop → 同名具名插槽。
- 不要用 `v-model` 包装受控值：React 的受控语义（值来自快照、变更走回调）在 Vue 里
  仍用 `:value` + 事件，避免出现两份状态。

### Step 2：模板平移

| React | Vue |
| --- | --- |
| `cond && <X />` | `v-if` |
| `cond ? <A /> : <B />` | `v-if` / `v-else` |
| `list.map(...)` | `v-for`，`:key` 必须用 SDK 稳定 ID |
| `className={cx(...)}` | `:class` 数组/对象，保留语义类名 |
| `style={{ "--kit-x": v }}` | `:style` 同名 CSS 变量 |
| `createPortal` | `Teleport` |

动态列表、消息分片、折叠状态禁止用数组下标做 key（与根规则一致）。

### Step 3：行为平移

详细对照见 `references/api-map.md`。四个最容易出错的点：

1. `useSyncExternalStore` → `shallowRef` + `subscribe`，在 `onScopeDispose` 退订。
2. `useEffect` → `watch(..., { immediate: true })` + cleanup；注意 Vue 默认 `flush: "pre"`，
   需要读更新后 DOM 的地方显式 `flush: "post"` 或 `await nextTick()`。
3. `useLayoutEffect` → 首次挂载用 `onMounted`，更新期用 `watch(..., { flush: "post" })`。
4. Context → `provide/inject` + `Symbol` key。`provide` 的值默认不是响应式的；
   需要随值变化的场景传 `ref` 或 `computed`。

### Step 4：合同自检（L2）

对着 React 源码逐项核对，缺一不可：

- [ ] `data-testid` 完全一致
- [ ] `role` 与可访问名完全一致
- [ ] `aria-label` / `aria-live` / `aria-expanded` 等完全一致
- [ ] 表单元素类型一致（contenteditable 仍是 contenteditable）
- [ ] 语义类名一致（`kit-*`、响应式可见性类、`sr-only`）
- [ ] 键盘行为一致（Enter 发送、Shift+Enter 换行、Esc 关闭、方向键导航）
- [ ] `prefers-reduced-motion` 下的降级仍生效
- [ ] 组件内没有新增业务请求

可以用 `scripts/inventory.mjs <React 文件>` 先生成一份待核对清单；它是启发式扫描，
不能替代逐行阅读。

### Step 5：测试

- 单测：与 React 版断言对称（同样的输入、同样的可观察输出），放在 Vue 包同目录。
- 浏览器：优先复用现有体验类 E2E，不新写一套“Vue 专用断言”。
- 组件级回归：React 夹具页有对应 Vue 孪生页时，两套跑同一组用例。

## 高危组件清单

这些组件必须逐条过，不能“看起来能跑”就收工：

| 组件 | 必须保留的行为 |
| --- | --- |
| `sender` | contenteditable 投影、skill chip 节点、IME 组合期间不重写 DOM、原子退格、选区偏移算法 |
| `message-list` | 高度测量顺序、只滚自身容器、用户上滚后不强制跟随、不用 `scrollIntoView` |
| `message-anchor-rail` | 与滚动容器的同步时序（`flush: "post"` + `nextTick`） |
| `session-sidebar` / `layout` | 同一刻只挂载一份侧栏、断点切换不重挂正文、抽屉焦点管理 |
| `markdown` | 保留 `rehype-sanitize` 与现有 schema；代码块/Mermaid 的注入位置一致 |
| 所有列表 | 稳定 ID 作 key；增删分片不串状态 |

## 禁止项

| 反模式 | 原因 | 正确做法 |
| --- | --- | --- |
| 用 `v-html` 直接渲染 Markdown | 绕过现有 sanitize 合同 | 保留 unified/rehype 管道，渲染已净化结果 |
| 把 Sender 换成 `<textarea>` | 破坏 chip、IME 与既有用例语义 | 保留 contenteditable + 命令式 DOM 操作 |
| `import` React 版组件或 React 依赖 | 把 React 拖进 Vue 产物，破坏 copy-in | 只共享框架无关模块 |
| 手抄 `strings.ts` / `theme.css` | 必然漂移 | 生成镜像 + 校验 |
| 在 Vue 侧另写请求/SSE/重连 | 两套行为分叉 | 复用 SDK 数据层与 hooks-vue |
| 为对齐 Vue 去改 React 的 DOM/testid | 破坏 React 版与 Console | 只补 Vue 侧 |

## 后续增量同步（React 优先的日常）

React 版合入新功能后，按这个顺序同步，不要重做整组件：

1. 读 React diff，分类：新增 prop、新增/修改 testid 或 aria、行为变化、纯样式。
2. 只改 Vue 侧对应部分；新增注入点用同名插槽。
3. 若 React 改了 testid/role/可访问名，两套同步改——共享 E2E 是唯一裁判。
4. 跑受影响组件的单测 + 对应用例；全量 parity 在发版前跑。
5. 在 PR 描述里写清“React 变更 → Vue 对应变更”，便于审查遗漏。

## 验收

```bash
pnpm typecheck
pnpm lint
pnpm check:architecture
pnpm check:i18n
pnpm e2e
```

新增包或入口时另按根规则更新 `AGENTS.md`、架构与依赖图；Vue 包尚未建立时，
本条验收适用于建立后的分支。

## 参考

- `references/api-map.md`：React/Vue API 逐项对照与示例。
- `scripts/inventory.mjs`：扫描 React 文件的 hooks、插槽候选与 L2 合同字符串。
