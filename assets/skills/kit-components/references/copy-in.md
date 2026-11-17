# 将组件和 Kit SDK 复制进项目

使用完整的 Skill 离线包。其 `assets/kit/` 带有匹配示例版本的组件源码、registry 和 Kit SDK。
也可以在 Kit 仓库运行 `pnpm pack:skills`，从 `assets/skills/dist/` 解压对应的离线包。
Copy-in 脚本可以用 Node.js 直接运行。

## 复制到应用

1. 找到待接入应用的 `package.json`。在 monorepo 中选择实际消费 Kit 的成员包。
2. 用 `--example` 选择当前 Skill 的示例文件，或传入页面需要的组件条目名。组件清单位于
   `assets/kit/chat-ui/registry.json`。脚本会复制选中示例的随附文件、组件及其传递依赖和主题。

```bash
node "<Skill 目录>/scripts/install.mjs" --dir "<应用目录>" chat
```

只使用 SDK 数据入口、hooks 或后端适配时，可以省略组件名和示例。

```bash
node "<Skill 目录>/scripts/install.mjs" --dir "<应用目录>"
```

SDK 源码位于应用的 `src/sdk/`。组件复制到 `src/components/kit/`，
通过 `--example` 复制的示例位于 `src/kit-examples/<Skill 名称>/`。脚本已为这些文件生成
相对导入路径。参考中的原始示例保留仓库的包导入，接入应用时先使用脚本生成可直接引用的源码。

业务代码也可按文件位置导入 SDK 的公开源码入口。例如在 `src/App.tsx` 中导入 `useChat`。

```tsx
import { useChat } from "./sdk/chat/hooks/index.ts";
```

按功能入口导入 SDK，例如消息类型位于 `src/sdk/messages/index.ts`。由宿主应用的工具链统一编译这些源码。

脚本会在应用的 `package.json` 中补上缺少的 SDK 和组件依赖，例如上游 `@openagentpack/sdk`
和 `zod`。用应用现有的包管理器执行安装并更新锁文件。应用已有同名依赖时，核对实际解析版本是否与
Skill 的 `assets/kit/sdk/copy-in.json` 兼容。React 页面使用宿主的 React 和同主版本的 React DOM。

将 `src/sdk/` 随应用提交。SDK 使用 `findLast` 和 `toReversed` 等
ES2023 API，应用的 TypeScript `lib` 应包含 `ES2023` 或更新版本，Web 项目继续保留 DOM 类型。
Node.js 宿主可以用已有的 TypeScript 运行器，例如安装 `tsx` 后运行 `node --import tsx src/main.ts`，
或通过应用的打包器一起编译。
仅用数据入口时，如果 `tsconfig.json` 会扫描整个 `src/`，可将 `src/sdk` 加入 `exclude`。
TypeScript 仍会检查应用实际导入的 SDK 模块。

## 使用复制后的 UI

脚本已改写复制后示例的组件导入。自己编写的页面可从 `src/components/kit/` 按文件位置导入。
组件文件的层级与 registry 中 `src/components/` 后面的路径一致。例如在应用的 `src/App.tsx` 中：

```tsx
import { Chat } from "./components/kit/chat/index.tsx";
import { SessionSidebar } from "./components/kit/session-sidebar/index.tsx";
```

复制的源码保留 `.ts` 和 `.tsx` 导入后缀。由打包器输出 JavaScript 的 TypeScript 项目可用
`noEmit` 和 `allowImportingTsExtensions` 检查这些文件。

在 Tailwind v4 的应用样式入口导入本地主题并确保扫描本地组件源码。Vite 项目初次接入时，
安装 `tailwindcss` 与 `@tailwindcss/vite` 并在 Vite 配置中注册 `tailwindcss()` 插件。
应用样式文件位于 `src/` 时，可以这样引入：

```css
@import "tailwindcss";
@import "./components/kit/theme.css";
@source "./components/kit";
```

遇到内容不同的本地组件、SDK 源码或示例时，脚本会在写入前报告冲突。先核对差异，
保留需要的定制。相同版本的未修改文件可重复运行脚本。

从旧版迁移时，先把已有的 SDK 源码和许可证合并到 `src/sdk/`。按文件所在位置，将业务代码及
先前复制的组件和示例中的旧 SDK 导入改为指向公开源码的相对路径。核对代码已使用新路径后，
可清理前版的 `#kit-sdk/` 映射或旧的 `@openagentpack/kit-sdk` 本地包依赖。

接入完成后，在应用中运行类型检查和构建。需要真实对话时，另外验证应用自己的后端和网络配置。

## 接入三栏会话页

使用 `use-kit-chat` Skill 时，用下面的命令复制完整三栏示例。

```bash
node "<Skill 目录>/scripts/install.mjs" --dir "<应用目录>" --example experience.tsx
```

从 `src/kit-examples/use-kit-chat/experience.tsx` 导入 `Experience`。该命令还会复制同目录的
资源面板和审批列表，以及它们所用的组件。为页面提供稳定的 Client、Provider 和应用回调，并导入本地主题。
