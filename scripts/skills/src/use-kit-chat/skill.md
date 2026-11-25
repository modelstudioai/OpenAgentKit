# 接入 Kit 对话

让一个 `useChat` 实例持有一个会话，再将状态传给页面的消息、输入和审批组件。
`ChatProvider` 连接业务后端。

## 确定目标框架

1. 用户已在本次任务中明确指定 React 或 Vue 时，以该选择为准。
2. 用户未指定时，检查已有目标项目的页面、应用入口和 `package.json` 中的 `react` 或 `vue`
   依赖。Monorepo 按目标应用所在的 workspace 判断。能确定时直接采用该框架。
3. 仍无法确定时进入 Question 阶段。新建项目且用户未指定框架时也进入该阶段。
4. 框架确定后，按对应组件包的 `peerDependencies` 核对目标项目的实际版本。React 路径要求
   `react` 和 `react-dom` 满足 `^18 || ^19`，Vue 路径要求 `vue` 满足 `^3.5.0`。新建项目选用
   兼容版本。已有项目版本不兼容时，说明实际版本和支持范围，由用户决定升级或在独立应用中接入后再继续。

按已确定的框架选择组件包、SDK 适配入口及示例。同一目标同时使用 `kit-components` 和
`use-kit-chat` 时，复用该选择。

### Question 阶段

询问「这次对话页面用 React 还是 Vue 3？」。宿主提供提问工具时，列出 `React` 和 `Vue 3`
两个选项。也可以直接在对话中提问。等用户给出明确答复后，先核对版本，再选择示例和生成代码。

## Vue 3 接入

- 从 `@openagentkit/sdk/chat/hooks-vue` 导入 `useChat` 和 `useComposer`。用响应式 getter 传入当前
  `sessionId`、稳定的 `ChatProvider` 和 `KitClient`。未选择会话时传 `null`。
- [Vue 会话示例](examples/experience.vue)使用 `@openagentkit/sdk/sessions/hooks-vue` 查询会话，
  提供列表错误提示和重试。示例结合 `Chat` 和 `ToolApprovalGroup` 展示新建、发送、停止及工具审批。
  首次发送失败后保留草稿，会话创建成功后选中该会话并刷新列表。
- Kit Server 的 `KitClient` 由宿主根据运行时配置及身份初始化。可用 `createKitChatProvider(client)`
  构造配套 Provider，再将两个实例传给示例。宿主切换身份时重挂会话页面。
- 使用 Vue 组件时导入 `@openagentpack/kit-chat-ui-vue/theme.css`，并让 Tailwind v4 扫描示例及组件源码。
  三栏布局和 copy-in 入口见 `kit-components` Skill 的 Vue 接入部分。

## React 接入

React 的 `KitProvider` 为应用提供默认 KitClient Context。
按[复制组件和 Kit SDK](references/copy-in.md)用 `--example` 接入所选示例。脚本会连同
SDK、所需组件和随附示例一起复制，并生成相对导入路径。

### 选择接入入口

- **完整会话页或工作台**可从[三栏会话页](examples/experience.tsx)开始。左侧 `SessionSidebar`、
  中间 `Chat` 和右侧 [Agent 资源面板](examples/agent-resources-panel.tsx)共享同一套 Agent 和会话选择。
  用[三栏示例复制命令](references/copy-in.md#接入三栏会话页)一并接入面板和[审批列表](examples/approval-list.tsx)，
  提供稳定的 Client、ChatProvider 和产物操作宿主。导入本地主题，
  并把示例及组件源码纳入 Tailwind v4 的扫描范围。
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
- **其他框架或自定义宿主**可从应用的 `src/sdk/chat/index.ts` 导入 `createChatController`，
  显式订阅及销毁，见[控制器示例](examples/controller.ts)。
- 拿到真实会话 ID 前传入 `null`。创建和列出会话通过独立接口完成。
- **Kit Server 的发现和用量**在 `KitProvider` 中使用 `usePlaza`、`useQuota` 和 `useQuotaRequests`，
  见[发现和用量示例](examples/discovery-usage.tsx)。`useAgentResources`、`useUsageLimits` 和附件元数据也由应用接口提供，
  见[体验数据示例](examples/experience-data.tsx)。
- **查询与写入状态**复用 `createQuery`、`createMutation` 和 `createObservable`，
  见[调用状态示例](examples/call-state.ts)。后端调用由宿主管理，Kit 成员管理归 Console 应用。

保持 Client 和 Provider 实例稳定。重渲染沿用同一个 Provider，审批展示复用当前的 `useChat` 实例。

### 实现交互

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

自定义 ChatProvider 接管对话传输。数据操作通过本地 `src/sdk/providers/kit/index.ts` 的
`createKitClient({ request, operations })` 配置。宿主创建稳定的 Client 和 Provider 并将其传给
[三栏会话页](examples/experience.tsx)。额度增加申请属于独立业务，由用户显式触发后调用
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
