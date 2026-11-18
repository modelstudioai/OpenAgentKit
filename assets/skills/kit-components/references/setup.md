# 安装与源码归属

## 从包导入

示例从 `@openagentpack/kit-chat-ui` 导入公开 API，并从 `@openagentpack/kit-sdk/messages`
及 `@openagentpack/kit-sdk/protocol` 导入类型。使用示例的 workspace 需要能访问这些包，
并提供兼容的 React 和 React DOM。当前仓库的 Kit 包为私有 workspace 包，以实际发布情况为准。

在已有 Tailwind v4 样式入口导入主题。

```css
@import "tailwindcss";
@import "@openagentpack/kit-chat-ui/theme.css";
```

为组件实际源码位置添加 Tailwind `@source`。自动扫描跳过 `node_modules`，也可能漏掉
workspace 符号链接。仓库的 `apps/web/src/styles.css` 使用以下路径。

```css
@source "../../../packages/chat-ui/src/**/*.{ts,tsx}";
```

该路径相对于样式表。copy-in 项目应改为扫描本地组件目录。
在生成的 CSS 中检查响应式工具类和主题工具类。

主题默认浅色，在主题作用域上设置 `data-kit-theme="dark"` 切换为深色。
员工端配色显式设置 `data-kit-appearance="workspace"`，支持的组件用 `variant="workspace"`
启用相应布局。文档预览显式选择这两项，组件仍以公开默认值为准。
让 Portal 内容留在同一个主题作用域。颜色、阴影、圆角和间距沿用已有 token。

## 复制组件源码

从 Kit 仓库运行 `pnpm kit:add <entry> --dir <project>`，将组件源码及登记的依赖复制到现有项目。
也可以在目标项目通过绝对路径运行 `scripts/kit/add-component.mjs`。
Registry 按源码文件分组，完整的公开组件名单见 [API 参考](api.md)。

| Registry 条目 | 可用组件 |
| --- | --- |
| `layout` | `Layout`，可组合会话侧栏、页头、聊天内容、弹窗和 Agent 资源面板 |
| `agent-header` | `AgentHeader` |
| `session-list` | `SessionList` |
| `session-sidebar` | `SessionSidebar`，以及 `SessionList`、`EmptyState` 和 `ErrorState` |
| `message` | `Message`、`MessageList`、`ReasoningBlock`、`ToolCallCard`、`ArtifactCard` |
| `message-anchor-rail` | `MessageAnchorRail` |
| `message-skeleton` | `MessageListSkeleton` |
| `chat` | `Chat`，以及消息和 Sender 依赖 |
| `sub-agent-panel` | `SubAgentPanel`，以及子 Agent 历史依赖 |
| `artifact-card` | `ArtifactCard`，以及用于产物预览和下载的 `FileCard` |
| `chrome` | `AgentHeader`、`StatusIndicator`、`EmptyState`、`ErrorState`、`ThreadPanel` 和 `ConfirmDialog` |
| `prompts` | `Prompts` |
| `sender` | `Sender`、`Sender.Header`、`SenderHeader` |
| `attachments` | `Attachments`、`Attachments.FileCard`、`AttachmentFileCard` 和 `FileCard` |
| `suggestion` | `Suggestion` |
| `actions` | `Actions`、`Actions.Copy`、`Actions.Feedback`、`ActionsCopy`、`ActionsFeedback` |
| `file-card` | `FileCard` |
| `markdown` | `Markdown`，以及代码块和图表依赖 |
| `code-highlighter` | `CodeHighlighter` 和 Actions |
| `mermaid` | `Mermaid`、Actions 和 CodeHighlighter |
| `tool-approval` | `ToolApprovalCard` 和 `ToolApprovalGroup` |

使用 copy-in 时在目标项目另行安装 npm 依赖。Markdown 使用 `react-markdown`、`remark-gfm`、
`rehype-sanitize`、`lowlight` 和 `mermaid`。工具审批与确认使用 `@radix-ui/react-alert-dialog`。
Layout 使用 `@radix-ui/react-dialog` 和 `@openagentpack/kit-sdk/hooks`。
版本以目标项目与组件 registry、包清单共同支持的范围为准。更新已复制的组件前先查看源码差异，
合并需要保留的本地修改。

## 运行时边界

- `kit-chat-ui` 负责渲染和本地交互。请求、上传、下载、复制与反馈持久化使用注入的 Hook 或应用回调。
- `kit-sdk/chat/hooks` 提供会话状态。`kit-sdk/providers/kit/react` 的 `KitProvider` 提供默认 Context，
  也可以直接传入自定义 `ChatProvider`。
- `kit-sdk` 将 SDK 事件投影为消息、线程和审批数据，组件直接消费投影结果。
- 浏览器运行时仅使用 SDK 的浏览器安全入口，Provider 凭据保留在后端。
- Kit 宿主应用从注入的运行时配置获取 `apiBaseUrl`，支持与页面不同源的后端。

示例通过应用注入的真实回调操作后端，由应用展示失败。真实 Cloud 接入需单独验收。
