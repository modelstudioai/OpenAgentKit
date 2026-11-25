# packages/chat-ui — Chat 产品组件

适用于本目录。先读[根规则](../../AGENTS.md)、[架构](../../docs/architecture.md)及
[目录规则](../../docs/repository-layout.md)。本包负责可 copy-in 的视觉与本地交互。

## 职责与入口

- `src/components/<component>/`：独立组件、中文说明与同目录测试；
  执行过程组件位于 `components/process/`。
- `src/index.ts`：公开导出；`registry.json`：复制入口、文件及依赖闭包。
- `src/theme.css`：冻结视觉 token、外观、动效与 reduced-motion。
- `src/components/kit-i18n/`：语言 Context 与词典合并；组件文案放同目录 `strings.ts`
  （default 导出 `{ "zh-CN", en }`），registry 以 `deps: ["kit-i18n"]` 与 `extraFiles` 随 copy-in 闭包复制。
- `tests/`：需要跨组件协作的回归；公开 API 与示例同步到开发 Skill。

## 不变量

1. 组件不 fetch 业务接口、不依赖 server，不持有 Provider 凭据、路由或会话生命周期。
   数据与动作由 SDK 公开能力、hooks 或应用回调注入。
2. 新组件至少有 Web、Console 或 Storybook 的真实调用方；缺 Primitive 按根 UI 规则补齐，
   不为设想中的需求预建组件库。
3. 主题与动效只消费冻结 token，不在组件新增颜色、尺寸、阴影或 keyframes 常量。
   折叠复用 `.kit-collapse`，所有状态过渡支持 reduced-motion。
4. 动态消息、分片和折叠状态使用 SDK 稳定身份，累计快照替换/删除时不按数组下标复用状态。
5. 组件复制保留目录层级与正确相对导入；依赖在 registry 闭包中声明，
   聚合入口只重导出。复制后的项目不依赖 monorepo 私有路径。
6. 高风险确认组件使用 AlertDialog 语义；Console 的 antd Modal 例外属于应用适配，
   不改为本包的普通 Dialog。禁止嵌套交互元素，并保持键盘、焦点及移动入口可用。
7. 图标图片/文本判定复用 `isIconImageSource`，不把 emoji 当图片地址；
   组件 Props 和用法以当前公开类型、同目录说明与编译示例为准。
8. 自动跟随只滚自己的列表容器，不使用会带动祖先的 `scrollIntoView`。
   空态保持顶部阅读、用户滚动保留位置，消息/子线程变化不能跳走整个文档页。
9. 消费方必须导入主题并显式配置 Tailwind `@source`；仅看到 DOM class
   不能证明 CSS 已生成。断点或主题修改要验证消费方的实际产物。
10. 组件用户可见文案必须走同目录 `strings.ts` 词典（`useKitStrings` / `resolveStrings`），
    公共组件暴露 `strings` 覆盖 prop；JSX 内不新增硬编码中文。en 与 zh-CN 键对齐由
    `pnpm check:i18n` 守护；宿主未提供 Provider 时回落 zh-CN，copy-in 零配置行为不变。

## 修改步骤

1. 核对现有组件、API 和真实调用方；在所属组件目录修改，跨组件测试按目录规则归属。
2. 公开导出、registry 及 copy-in 相对依赖同步；移动文件保留必要兼容聚合入口。
3. 改公开 API 同步 `scripts/skills/src/` 的 catalog / 示例，运行 `pnpm gen:skills`；
   不手改派生的 API 参考或 MDX 标记区。
4. 用可观察交互验证发生变化的行为，检查调用方与移动端；不为静态样式或框架默认行为堆测试。

## 验收

```bash
pnpm typecheck
pnpm lint
pnpm --filter @openagentpack/kit-chat-ui test
pnpm check:architecture
pnpm check:docs
```

运行时代码或样式变化另验相关 app 测试、构建和浏览器用例；
仅修改规范文字按根文档验证规则执行。
