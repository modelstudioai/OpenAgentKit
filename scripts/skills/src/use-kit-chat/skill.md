# 接入 Kit 对话

让一个 `useChat` 实例持有一个会话，再将状态传给页面的消息、输入和审批组件。
`ChatProvider` 连接业务后端，React 的 `KitProvider` 为应用提供默认 KitClient Context。

## 选择接入入口

- **完整会话页或工作台**可从[三栏会话页](examples/experience.tsx)开始。左侧 `SessionSidebar`、
  中间 `Chat` 和右侧 [Agent 资源面板](examples/agent-resources-panel.tsx)共享同一套 Agent 和会话选择。
  一并复制面板和[审批列表](examples/approval-list.tsx)，提供稳定的 Client、ChatProvider 和产物操作宿主。
  导入 `@openagentpack/kit-chat-ui/theme.css`，并把示例及组件源码纳入 Tailwind v4 的扫描范围。
- **Kit Server 和自建后端**使用 `useChat({ sessionId, provider })`。标准事件后端可配置
  `createSessionEventChatProvider`，Web 应用走相同入口，见[自建后端示例](examples/custom-chat.tsx)。
- **已有 KitClient 的应用**可继续在 `KitProvider` 内使用 `useChat(sessionId)`，
  见 [Context 示例](examples/default-chat.tsx)。
- **本地成员登录**由 Kit Server 默认要求。挂载 `KitProvider` 前使用稳定的
  `createMemberAuthController` 和 `useMemberAuth`，参考[成员登录示例](examples/member-auth.tsx)。
  宿主存储按最终完整的 API URL 隔离，只保存令牌和有效期。业务子树以 `generation` 为 key，
  切换账号时清理草稿、文件及会话状态。提供 `createClient(request)` 和 `createChatProvider(request)`，
  让显式 Provider 复用相同的固定身份与取消边界，再将 `auth.chatProvider` 传给 `useChat`。
- **已有自定义后端适配器**可直接使用 `useChat({ sessionId, provider })`，
  无需 `KitProvider`，见[自建后端示例](examples/custom-chat.tsx)。
- **非 React 宿主**从 `@openagentpack/kit-sdk/chat` 导入 `createChatController`，
  显式订阅及销毁，见[控制器示例](examples/controller.ts)。
- 拿到真实会话 ID 前传入 `null`。创建和列出会话通过独立接口完成。
- **Kit Server 的发现和用量**在 `KitProvider` 中使用 `usePlaza`、`useQuota` 和 `useQuotaRequests`，
  见[发现和用量示例](examples/discovery-usage.tsx)。`useAgentResources`、`useUsageLimits` 和附件元数据也由应用接口提供，
  见[体验数据示例](examples/experience-data.tsx)。
- **查询与写入状态**复用 `createQuery`、`createMutation` 和 `createObservable`，
  见[调用状态示例](examples/call-state.ts)。后端调用由宿主管理，Kit 成员管理归 Console 应用。

保持 Client 和 Provider 实例稳定。重渲染沿用同一个 Provider，审批展示复用当前的 `useChat` 实例。

## 实现交互

1. 查询 [API 参考](references/api.md)了解所用版本的公开合同。
2. 用 `MessageList` 渲染 `messages`。自定义渲染器须使用稳定的消息和分片 ID，
   快照可能替换或移除已有分片。
3. 将 `Sender.submitDisabled` 绑定到 `!chat.canSend`，草稿保持可编辑。
   `send` 成功后只清理已提交的草稿，失败时保留。
4. 通过 `chat.stop()` 中断远端执行。卸载或切换会话只会取消浏览器订阅。
5. 处理工具审批时，参考[工具审批流程](references/approvals.md)并复用 [ApprovalList](examples/approval-list.tsx)。

新会话目标、StrictMode、Provider 更换和各状态的含义见[会话生命周期](references/lifecycle.md)。
所有可编译源文件均收录在[示例参考](references/examples.md)。

## 职责边界

按 `useChat` 的公开接口接入。禁止自行添加 `setMessages`、消息编辑、重新生成或请求队列，
也禁止自动重发失败的写请求。数据 Hook 接受显式 `client`，`useKitClient` 保留 Context 兼容入口。

自定义 ChatProvider 接管对话传输。数据操作单独通过 `createKitClient({ request, operations })` 配置，
见[三栏会话页](examples/experience.tsx)。额度增加申请属于独立业务，由用户显式触发后调用
`useCreateQuotaRequest().submit`，然后刷新用量及申请历史。

复用 `useAttachments` 和 `useArtifactActions` 管理上传与下载。文件选择、预览窗口和保存由宿主负责。
文件可用后再发送。使用 Kit Server 时，创建会话传 `files`，向已有体验会话发送消息传 `attachments`。
参考[会话生命周期](references/lifecycle.md)了解 `useComposer` 对两种路径的处理。

需要鉴权的产物下载使用 `client.downloadFile(fileId, { sessionId })`。`fileDownloadUrl` 只生成 URL。
登录过期、HTTP 401 和流中的未授权错误均结束当前本地身份。恢复网络请求失败时保持登录要求，
匿名模式须由服务端显式开启，与 mock gateway 设置独立。

运行时由 Stream、Request、Provider 和 Chat 组成。控制器属于核心的 Chat 层，
Hook 只将其状态和生命周期绑定到 React。Provider 通过 `transformMessage` 定义事件到消息的转换，
Chat 重建账本时调用该方法并持有消息。转换规则留在 Provider，保留消息和分片 ID。
页面 effect 只负责页面生命周期内的绑定，请求、SSE 解析及重连由核心层执行。
