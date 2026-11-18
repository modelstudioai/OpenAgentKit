# 组件组合与行为

准确类型、必填 Props、别名及文档来源见[生成的 API 参考](api.md)。
本指南补充类型签名之外的组件行为。

## 通用组件与页面框架

`Layout` 管理桌面侧栏、移动端 Radix 抽屉、页头插槽、限高的内容区、右侧资源面板和可视视口尺寸。
提供 `h-dvh` 等有界容器，若宿主已管理尺寸则设置 `fitViewport=false`。
路由、鉴权和会话创建由应用负责。

在调用方的侧栏容器中组合品牌、新建会话入口、`SessionSidebar`、导航及账号，并从 `sidebar` 渲染回调返回。
桌面侧栏与移动抽屉共用一套内容，按断点只挂载其中一个。导航后调用 `closeSidebar`，
在侧栏顶部放入 `closeButton`。`header` 回调提供 `menuToggle`，可传给 `AgentHeader` 的 `leading`。
未提供页头时，`mobileTitle` 为移动端备用页头提供标题。待确认状态由调用方持有，通过 `dialogs` 渲染，
使其留在移动端焦点范围内并在断点变化时保持可见。参考[布局示例](../examples/layout.tsx)。

完整会话页在 `children` 渲染所选会话的 `Chat`。通过 `aside` 回调展示 Agent 名称、描述、资源列表、
可选的 `SubAgentPanel` 和各项 `ArtifactCard`，回调提供移动端 `closeButton`。
传入 `asideOpen` 和稳定的 `onAsideOpenChange`，并在页头放置带 `aria-expanded` 的开关。
按所选 slug 读取 Agent 元数据，将所选会话的多 Agent 和产物快照传给面板。

`AgentHeader` 展示 `AgentSummary | null`。传入 `actions` 会替换默认的新建会话按钮，
`actions={null}` 隐藏该区域。会话创建由应用处理。工作台页头使用 `compact`，
`StatusIndicator variant="badge"` 可放进操作区。

传入非空 `agents` 数组和 `onPickAgent` 可提供标题选择器。回调传出 Agent slug，
应用负责更新路由、选择会话及清理消息。图标支持图片 URL、相对路径或 Emoji 等文本。

`SessionList` 是受控导航列表，需要 `sessions`、`activeId` 和 `onSelect`。
`menu` 渲染参数仅提供行操作入口，确认和 HTTP 请求由应用负责，破坏性操作必须经过应用确认。
使用业务 `session_id` 作为标识。`SessionSidebar` 渲染会话目录，包含分组按需分页、最近会话、搜索，
以及各区域的高亮、重命名和错误提示。外部侧栏框架由调用方组成。

`StatusIndicator` 分别显示连接状态和执行阶段。`connected` 和 `turnRunning` 是兼容用的必填属性。
接入现行 `useChat` 时同时传入 `phase`、`connection`，并将 `streamError` 传给 `error`。
重连期间仍以业务事件判断回合是否完成。

`EmptyState` 接受标题和可选提示。`ErrorState` 接受消息和可选重试回调，重试行为由调用方控制。
`ThreadPanel` 兼容展示已经投影好的 `threads`，转发复制和下载回调，记录为空时不渲染。
新会话页通过 `Chat` 的 `multiAgent` 展示、加载和浏览子 Agent 历史。主会话完成以主线程状态为准。

`ConfirmDialog` 是按条件挂载的 Radix AlertDialog，管理焦点限制与恢复。`danger` 默认为 `true`。
请求期间的 `busy` 禁用确认、取消及 Escape。调用方负责获取计划、持有与计划匹配的一次性确认令牌、
管理请求状态，并在成功后关闭。示例只重置本地预览。

参见[通用组件示例](../examples/general.tsx)。

## Chat 与消息投影

`Chat` 组合 `MessageList` 和默认的 `Sender`。`turnRunning=false`、`canSend=true` 为默认值，
实际接入时传入 Hook 的真实状态。默认输入框只在发送成功且草稿期间未被修改时清理已提交的内容，
提交失败则保留。

额度耗尽等需要完全禁用默认输入时使用 `composerDisabled`，正在运行的回合仍可停止。
`canSend=false` 只拦截提交，草稿仍可编辑。自定义 `sender` 插槽需自行实现这两种策略。

传入 `scrollKey={sessionId}` 可切换逻辑滚动目标，同时保留输入框挂载。使用自定义 `sender` 插槽时，
调用方需将 `onSend`、`onStop`、`turnRunning` 和 `canSend` 接入该输入框。
`approvals` 插槽在消息流末尾渲染调用方提供的主 Agent 审批卡片。无审批时传 `null`，
真值的空容器会显示等待审批提示并隐藏挂起指示。

默认或自定义 Provider 均可传入 `multiAgent={chat.multiAgent}`。子卡片出现在主消息流中的派发位置，
展开后可查看只读历史并使用分页、错误提示、重试和文件操作。运行中自动展开，结束后可再次打开。
展开和加载卡片时输入框保持挂载。发送就绪、审批和回合结束以主事件为准，
主输入框的停止动作中断整个主回合。多 Agent 通过内联卡片展示。
可选的 `SubAgentPanel` 在侧栏按名称分组派发记录，并在弹窗中打开事件历史。

将当前 Agent 的 `skills: SenderSkill[]` 传给 Chat，用于斜杠选择和消息标签。
将 `onSend(text, selectedSkills)` 适配为 `chat.send(text, { skills: selectedSkills })`，
注意两者第二个参数的形状。自定义 Sender 需要同一技能列表和自己的提交适配。
单独使用 Message 或 MessageList 时传入技能名称数组 `string[]`，
以原位还原已知协议标记，未知标记仍显示为文本。

参见[由 Hook 驱动的 Chat 示例](../examples/chat-runtime.tsx)。

`MessageList` 默认 `autoScroll=true`。在 flex 布局内给父容器设置有界高度和 `min-h-0`。
查看较早的消息时暂停跟随，回到底部、切换 `scrollKey` 或清空列表时恢复。
`autoScroll={false}` 会停用跟随，切换会话也不会触发。自定义隐藏面板可传 `active=false` 暂停滚动。
成功加载较早的一页后更新 `historyCursor`，以保留阅读锚点。

`Message` 接收 `ChatMessage`，按原顺序展示文本、推理、工具、产物、状态和未知分片。
相邻文本或推理分片可在渲染时合并。自定义渲染动态列表时使用核心层提供的稳定 ID，
累计快照可能替换或移除分片。含文本且已完成的助手消息提供复制，失败、待处理、流式和已中断分别展示。

Provider 定义从 `SessionEvent` 到 `ChatMessage` 的转换，Chat 持有重建后的状态，组件接收展示数据。
调用方也可直接提供 `ChatMessage` 形状的 Props，由调用方负责消息更新、身份和执行状态。

`ReasoningBlock` 初始折叠，生成过程中也是如此，并在内容和状态更新时保留用户手动展开或折叠的选择。
保留推理分片自己的状态，状态缺失时不可认定已完成。
`ToolCallCard` 展示 `type="tool"` 的 `MessagePart`，支持 `running`、`done` 和 `error`。
工具执行和审批由其他入口承担。两者都可传入 `contentMaxHeight` 来覆盖展开区默认的 `max-h-80`。
`ArtifactCard` 用 `FileCard` 展示输出文件并委托预览与下载，输入附件和输出产物走各自的数据链路。

参见[内容示例](../examples/content.tsx)。

## 输入与附件

员工端布局显式启用 `data-kit-appearance="workspace"` 及 `variant="workspace"`。
Chat 将 variant 转发给默认 Sender 和消息列表，自定义 Sender 需单独设置。工作台 Sender 将编辑区放在
工具栏上方，前缀在左，发送或停止在右，附件放在卡片内的 Header 中。省略 variant 时使用默认的行内布局。

`Sender` 支持受控 `value` 或非受控 `defaultValue=""`。默认提交模式为 `enter`，
Shift+Enter 换行。`shiftEnter` 交换二者的行为，`false` 禁用键盘提交。
输入法合成期间不提交。高度默认在一至六行之间自适应。

- `onSubmit(text, skills?)` 接收文本及提取出的技能名，草稿由调用方清理。contenteditable 编辑器
  将已知的 `/name ` 标记渲染为原子行内标签。应用操作成功后重置受控值，或调用 `SenderRef.clear()`。
- `loading` 将默认发送操作切换为停止。`submitDisabled` 阻止按钮和键盘提交，草稿仍可编辑。
  `disabled` 禁用输入，`readOnly` 设为只读并禁止提交。两种情况下都可停止正在生成的回合。
- `onKeyDown` 先于内置提交执行。Suggestion 通过调用 `preventDefault()` 接管 Enter。
- `onPasteFile` 接收粘贴的文件，与 `Attachments.onSelectFiles` 接入同一上传函数。
- `suffix` 和 `footer` 渲染回调接收绑定 Context 的 `SendButton`、`LoadingButton`、`ClearButton`，
  从回调参数使用这些按钮。
- `Sender.Header` 和单独导出的 `SenderHeader` 是同一组件。默认 `open=false`、`closable=true`。
  关闭 Header 后数据仍由调用方保留。
- `SenderRef` 提供聚焦、失焦、清空、在当前选区插入及访问原生输入元素的能力。

`Attachments` 默认 `items=[]`、`multiple=true`、`disabled=false`、`overflow="wrap"`。
组件提供原生选择和拖放，上传由应用完成。`onPick` 可用宿主桥接替换原生选择器，回调须自行校验类型和数量。
原生 `accept` 只帮助筛选文件，上传内容仍应在应用或后端校验。

`maxCount` 限制内置的选择与拖放。共用应用处理函数也须执行同样的限制，覆盖粘贴入口。
`getDropContainer` 要求容器具备 CSS 定位。即使配置了宿主选择器，也应为拖放提供 `onSelectFiles`。

`Attachments.FileCard` 和 `AttachmentFileCard` 是同一个单项组件，展示调用方传入的 `AttachmentItem` 状态。
上传时隐藏移除操作，可展示确定或不确定的进度。已完成或失败的项在提供回调后可以移除，
该操作仅更新本地状态，远端文件另行管理。

完整接线见[附件输入示例](../examples/attachment-sender.tsx)。选择、粘贴和拖放共用一个处理函数，
有文件正在上传或上传失败时禁止提交，发送失败保留草稿，卸载后忽略迟到的上传结果。
明确丢弃某个会话的上传草稿时重新挂载此输入组件。单独更改 `Chat.scrollKey` 只改变滚动目标。

示例的 `onSubmit(text, fileIds)` 是应用层回调，`Sender.onSubmit` 使用自己的公开签名。
上传仅返回文件引用。使用 Kit Server 时须等扫描状态变为可用。创建体验会话时将引用作为 `files`
传给 `client.createSession`。已有体验会话通过 `chat.send(text, { attachments })` 发送，
服务端先挂载再发送，发送失败会尝试撤销本次新增挂载。自建后端须实现自己的附件合同。

## 提示语与建议

`Prompts` 在 `items` 为空时不渲染。`vertical`、`wrap`、`fadeIn` 和 `fadeInLeft` 默认
`false`。包含子项的父项是分组，只有可选子项触发点击，禁用项不会提交。
`onItemClick` 提供提示语数据，由应用决定填入草稿还是直接发送。

`Suggestion` 通过渲染参数包裹输入，默认 `block=false` 且弹层关闭。将 `onKeyDown` 和
`inputProps` 同时传给 Sender。通过 `onTrigger(info)` 打开、`onTrigger(false)` 关闭，
在 `onSelect` 中更新草稿。组件处理方向键、Enter、Escape 和嵌套选项，应用负责斜杠解析、触发规则与过滤。

参见[提示语与建议示例](../examples/prompts-suggestion.tsx)。

## 反馈、文件与富文本

`Actions` 是可组合的操作组，默认 `items` 为空且 `variant="borderless"`。
点击时先调用选项回调，再调用组回调。嵌套 `subItems` 形成展开菜单，选项需要稳定的 key。

`Actions.Copy` 与 `ActionsCopy` 共用实现。异步 `onCopy` 失败时必须 reject，
省略回调则使用浏览器剪贴板。文本为空、有操作待处理或 `disabled` 时无法复制。
剪贴板权限被拒绝时显示失败。

`Actions.Feedback` 和 `ActionsFeedback` 都是受控组件。值为 `default`、`like` 和 `dislike`，
再次选择当前项时回到 `default`。反馈由应用持久化，写入期间可禁用或对账。

`FileCard` 默认 `loading=false`、`disabled=false`。优先以 `onClick` 为主操作，省略时使用
`onDownload`。两者均提供时，下载使用单独的按钮。缩略图 `src` 由调用方提供，文件读取由应用负责。
`ArtifactCard` 将输出文件的命名映射到文件卡片。

`Markdown` 接收字符串，使用 GFM 和净化处理，并委托 `CodeHighlighter` 渲染代码块。
完整 Mermaid 围栏渲染为图表，尚未完整的流式围栏先展示源码。复制或扩展渲染器时保留净化。

`CodeHighlighter` 默认 `copyable=true`、`showLineNumbers=false`。语言缺失或不受支持时按纯文本展示。
超过 50,000 字符的输入保留全文与复制功能，同时跳过语法高亮。`header={false}` 隐藏页头和其中的复制操作。
渲染器输出文本或 AST 节点。

`Mermaid` 默认显示图片，`copyable=true`、`streaming=false`。图表尚未完整时传入
`streaming=true`。解析失败或遇到资源加载语法时回退到源码。
使用 Mermaid 严格安全模式，以图片方式渲染 SVG。处理任意工具输出时保留这些边界。

参见[内容和反馈示例](../examples/content.tsx)。

## 工具审批

`ToolApprovalCard` 接收 `ChatToolApproval` 投影和异步 `onDecision`、`onRefresh`。
可选的 `onStop` 中断整个回合。拒绝调用仅对该工具生效。

接入 Hook 的 `submitApproval`、`refreshApprovals` 和 `stop`。
使用 `batch_id` 和 `call_id` 的组合做 key。卡片内联显示冻结参数，完整 JSON 可展开。
允许和拒绝均单击提交。身份或参数改变后，控制器拒绝旧的提交。

只有 `pending` 且 `actionable` 时可做决定。`submitting` 和 `submitted` 属于审批提交状态，
执行完成仍以业务事件为准。`uncertain` 时先刷新，禁止自动重新提交。
`stale` 及未知类型的工具为只读。拒绝理由可选，最多 200 字符。

参考[审批示例](../examples/approvals.tsx)。后端负责当前批次、归属和重复回复的权威校验。

## 发现与用量

`CategoryTabs` 接收受控的 `active` 和 `onChange`，在传入的分类前添加 `featured`。
分类数据可含数量，当前界面只显示分类，选中分类后的查询与导航由应用负责。

`PlazaCard` 展示一项 `PlazaEntry`，包含分类、推荐或我的徽标和近期回合数。
`onOpen` 回调接收 slug，应用决定如何打开对话。

`MeterBar` 将填充限制在 0–100%。`unlimited` 显示无百分比的轨道，
`max` 非正数时也不填充。额度由调用方计算和执行。`ActivityHeatmap` 按传入顺序展示天数，
以唯一的日期字符串作为 key，并以最大回合数计算相对强度。
调用方按期望范围提供所有日期，包括零活动日期，并负责查询、排序及补日期。

参见[发现与用量示例](../examples/discovery-usage.tsx)。后端操作由调用方负责。

成员累计会话用量与 Credits 进度条分别展示。独立呈现输入、输出和缓存 Token 计数及活动与总耗时，
区分未知值，显示各指标覆盖情况、刷新时间和部分采集状态。缓存的统计方式因 Provider 而异，
因此各项 Token 计数不得直接相加。管理端 Hook 配合已有表格、空态和错误组件，
Provider 详情查询及额度执行留在业务层。会话删除后可保留数字用量，消息正文仍由 Provider 持有。
`SessionList` 的删除回调需处理无法停止执行或无法保存用量所导致的服务端拒绝，
等删除确认后再隐藏会话。
