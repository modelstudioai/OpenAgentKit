# 安装与源码归属

## 接入组件和主题

按[复制组件和 Kit SDK](copy-in.md)接入私有 Kit 依赖。复制的组件通过应用内源码路径导入，
类型通过 `src/sdk/messages/index.ts` 与 `src/sdk/protocol/index.ts` 读取。
在已有 Tailwind v4 样式入口导入本地主题，检查生成的 CSS 包含所需的响应式工具类和主题工具类。

主题默认浅色，在主题作用域上设置 `data-kit-theme="dark"` 切换为深色。
员工端配色显式设置 `data-kit-appearance="workspace"`，支持的组件用 `variant="workspace"`
启用相应布局。文档预览显式选择这两项，组件仍以公开默认值为准。
让 Portal 内容留在同一个主题作用域。颜色、阴影、圆角和间距沿用已有 token。

## 复制组件源码

将下表的 registry 条目名传给 Skill 的复制脚本。Registry 按源码文件分组，
完整的公开组件名单见 [API 参考](api.md)。

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

组件所需的 npm 依赖随 registry 选择。Layout 还通过本地 SDK 的 `src/sdk/hooks/index.ts`
获取屏幕尺寸；确认弹窗通过 `@radix-ui/react-alert-dialog` 管理显式确认。

## 运行时边界

- `kit-chat-ui` 负责渲染和本地交互。请求、上传、下载、复制与反馈持久化使用注入的 Hook 或应用回调。
- `kit-sdk/chat/hooks` 提供会话状态。`kit-sdk/providers/kit/react` 的 `KitProvider` 提供默认 Context，
  也可以直接传入自定义 `ChatProvider`。
- `kit-sdk` 将 SDK 事件投影为消息、线程和审批数据，组件直接消费投影结果。
- 浏览器运行时仅使用 SDK 的浏览器安全入口，Provider 凭据保留在后端。
- Kit 宿主应用从注入的运行时配置获取 `apiBaseUrl`，支持与页面不同源的后端。

示例通过应用注入的真实回调操作后端，由应用展示失败。真实 Cloud 接入需单独验收。
