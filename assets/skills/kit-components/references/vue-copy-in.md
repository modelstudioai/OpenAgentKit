# Vue 源码复制

在已安装依赖的 Kit 仓库根目录执行以下命令。将 `<project>` 替换为目标 Vue 项目的绝对路径。
目标项目的 `vue` 版本须满足组件包的 `peerDependencies`，当前为 `^3.5.0`。

## 准备 Kit SDK

复制 `Chat`、`Layout` 或运行会话示例时，目标项目需要访问私有的 `@openagentkit/sdk`。
目标项目已有对应版本的 workspace 依赖时可直接使用。独立项目可从与组件相同的 Kit checkout
构建本地 SDK 包。

```sh
pnpm --filter @openagentkit/sdk build
pnpm --dir packages/sdk pack --pack-destination "<project>"
pnpm --dir "<project>" add "./<pack 输出的文件名>"
```

最后一条命令使用 `pack` 打印的实际文件名，例如 `openagentkit-sdk-1.0.0.tgz`。目标项目使用
`@openagentkit/sdk` 的公开入口导入 SDK。

## 复制组件和安装依赖

用 `--framework vue` 复制所需组件及其传递依赖。比如下面分别复制聊天与附件输入。

```sh
pnpm kit:add chat --framework vue --dir "<project>"
pnpm kit:add attachments --framework vue --dir "<project>"
```

三栏布局示例还需要复制 `layout` 和 `session-list`，会话接入示例还需要复制 `tool-approval-group`。

组件源码和 `theme.css` 位于目标项目的 `src/components/kit`。按 Vue `registry.json` 中所选条目
及其 `deps` 递归收集 `npmDependencies`。Kit SDK 使用上一节的 workspace 或本地包，其余依赖在
目标项目中安装，版本参考 Vue 组件包的 `package.json`。`Markdown` 和 `CodeHighlighter` 使用的
`@types/hast` 可通过 `pnpm --dir "<project>" add -D @types/hast` 安装。

将示例中的组件导入换成对应的本地源码路径，导入复制后的主题样式，并将组件和示例所在目录纳入
Tailwind v4 的扫描范围。完成后运行目标项目的类型检查。
