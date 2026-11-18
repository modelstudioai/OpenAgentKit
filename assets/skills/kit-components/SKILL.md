---
name: kit-components
description: "用 OpenAgentPack Kit 的 React 组件搭建对话界面，包括带会话导航、聊天区和 Agent 资源的完整页面。适用于组件选型、布局、消息渲染、附件输入和工具审批界面。"
---

# Kit 对话组件

用 `@openagentpack/kit-chat-ui` 的公开组件搭建所需界面。示例使用包导入。
通过 copy-in 引入的项目应改为从本地组件路径导入。

## 选择页面组合

- **完整会话页或工作台**可从[工作台布局](examples/layout.tsx)开始。将 `SessionSidebar` 放进
  `Layout.sidebar`，当前会话的 `Chat` 放进 `children`，Agent 信息和资源放进 `Layout.aside`。
  用 `AgentHeader` 渲染页头和资源开关。需要绑定 Client 和 Provider 时，参考 `use-kit-chat`
  Skill 的 `examples/experience.tsx`。
- **嵌入式对话**可用 `Chat` 展示消息和输入框。传入 `multiAgent={chat.multiAgent}` 展示内联子 Agent
  卡片。可用 `sender` 插槽自定义输入，也可以直接组合 `MessageList` 和 `Sender`。
- **开启对话**使用 `Prompts`，由调用方决定点击提示语后填入草稿还是直接发送。
- **输入与附件**使用 `Sender`、`Sender.Header`、`Attachments` 和 `Suggestion`。
- **内容渲染**使用 `Message`、`ReasoningBlock`、`ToolCallCard`、`ArtifactCard` 和 `Markdown`。
- **反馈和审阅**使用 `Actions`、`FileCard`、`CodeHighlighter`、`Mermaid` 和 `ToolApprovalCard`。
- **发现和用量**使用 `CategoryTabs`、`PlazaCard`、`MeterBar` 和 `ActivityHeatmap`。

接入样式或复制组件源码前，阅读[安装与配置](references/setup.md)。组件行为与职责见[组件组合](references/composition.md)
的相关章节。[API 参考](references/api.md)覆盖公开运行时导出、静态子组件和导出类型。
[示例参考](references/examples.md)与下列可编译源文件同源。

## 使用规则

1. 把 `useChat` 结果和应用回调传给组件。核心层负责 Stream、Request、Provider 和 Chat，
   React 将会话状态绑定到组件生命周期。组件只负责展示与交互，请求、百炼 SSE 解析、凭据和会话创建归上层。
   如需接入后端，可另用 `kit-chat-provider`，本目录可独立用于组合组件。
2. 保留 `ChatMessage` 以及核心层提供的消息和分片 ID。Provider 定义事件到消息的转换规则，
   Chat 持有重建后的消息，组件接收这些 Props。调用方也可提供同形的数据。累计快照可能替换或删除分片，
   动态分片须用稳定 ID 作为 key。
3. 连接恢复或等待工具审批时传入 `submitDisabled={!chat.canSend}`，草稿保持可编辑。
   `loading` 表示消息生成，文件上传用独立状态。
4. 调用方管理输入清理和文件上传。文件选择、粘贴、拖放统一走一个应用上传函数。
   文件上传成功后仍需显式挂载到会话。
5. 工具审批与破坏性操作都需显式确认。`ToolApprovalCard` 提交一次经审阅的决定，并等待服务端权威状态。
   破坏性操作由应用获取计划和确认令牌。
6. 使用 Tailwind 工具类和已有 `--kit-*` token。即使组件位于 workspace 或链接包中，
   也要确保 Tailwind 能扫描组件源码。

## 示例

- [工作台布局](examples/layout.tsx)包含会话导航、中央 Chat 插槽、Agent 信息和资源、响应式面板及调用方控制的弹窗。
- [由 Hook 驱动的对话](examples/chat-runtime.tsx)展示多 Agent 历史、默认输入框和主 Agent 工具审批。
- [推理区生命周期](examples/reasoning.tsx)展示默认折叠的预览，以及状态变化时保留用户手动展开或折叠的选择。
- [附件输入](examples/attachment-sender.tsx)涵盖文件选择、粘贴与拖放、上传回调、失败和移除、保留草稿及自定义输入操作。
- [通用组件](examples/general.tsx)包含布局组合、页头、导航、状态辅助组件、确认预览和旧版 `ThreadPanel` 展示。
- [内容与反馈](examples/content.tsx)包含独立消息分片、整条消息、Markdown、代码、图表、文件、复制和受控反馈。
- [提示语与建议](examples/prompts-suggestion.tsx)演示插入草稿和支持键盘操作的斜杠菜单。
- [工具审批](examples/approvals.tsx)演示由调用方管理的审批决定、刷新和停止回调。
- [发现和用量](examples/discovery-usage.tsx)包含受控分类、Agent 卡片、额度进度条和活动摘要。

部分组件内置固定中文标签。需要修改文案时，优先使用现有的标签 Props。用户明确要求调整时，
可修改 copy-in 后的本地源码。
