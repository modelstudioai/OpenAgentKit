# API 参考

本页由 `pnpm gen:skills` 生成。更新公开 TypeScript 声明或中文 catalog 后重新生成。
字段类型和必填性来自公开 API，行为说明依据所列文档整理。
组件表格列出 Kit 自有属性。组件按声明继承标准的 React/DOM 属性。

## 目录

- [Actions](#actions)
- [ActionsCopy](#actionscopy)
- [ActionsFeedback](#actionsfeedback)
- [Actions.Copy](#actionscopy-1)
- [Actions.Feedback](#actionsfeedback-1)
- [AttachmentFileCard](#attachmentfilecard)
- [Attachments](#attachments)
- [Attachments.FileCard](#attachmentsfilecard)
- [Layout](#layout)
- [Chat](#chat)
- [AgentHeader](#agentheader)
- [isIconImageSource](#isiconimagesource)
- [ConfirmDialog](#confirmdialog)
- [EmptyState](#emptystate)
- [ErrorState](#errorstate)
- [SessionSidebar](#sessionsidebar)
- [StatusIndicator](#statusindicator)
- [SubAgentPanel](#subagentpanel)
- [ThreadPanel](#threadpanel)
- [CodeHighlighter](#codehighlighter)
- [FileCard](#filecard)
- [Markdown](#markdown)
- [Mermaid](#mermaid)
- [ArtifactCard](#artifactcard)
- [Message](#message)
- [MessageList](#messagelist)
- [MessageAnchorRail](#messageanchorrail)
- [MessageListSkeleton](#messagelistskeleton)
- [ReasoningBlock](#reasoningblock)
- [ToolCallCard](#toolcallcard)
- [Prompts](#prompts)
- [Sender](#sender)
- [SenderHeader](#senderheader)
- [Sender.Header](#senderheader-1)
- [SessionList](#sessionlist)
- [Tooltip](#tooltip)
- [Menu](#menu)
- [MenuTrigger](#menutrigger)
- [MenuContent](#menucontent)
- [MenuItem](#menuitem)
- [Suggestion](#suggestion)
- [ToolApprovalCard](#toolapprovalcard)
- [ToolApprovalGroup](#toolapprovalgroup)
- [PlazaCard](#plazacard)
- [CategoryTabs](#categorytabs)
- [MeterBar](#meterbar)
- [ActivityHeatmap](#activityheatmap)
- [SkillGlyph](#skillglyph)
- [相关类型](#相关类型)

## Actions

组合回复操作、嵌套菜单、复制和受控反馈。

从 `@openagentpack/kit-chat-ui` 导入 `Actions`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/actions/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/actions.mdx`。
[可编译示例](../examples/content.tsx)

- 默认 items=[]、variant="borderless"。
- 先执行单项回调，再执行组的 onClick。

```ts
export function Actions({ items, onClick, children, variant, className, "aria-label": ariaLabel, }: ActionsProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `ActionsItem[] \| undefined` |
| `onClick` | 否 | `((info: ActionsClickInfo) => void) \| undefined` |
| `children` | 否 | `ReactNode` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |
| `aria-label` | 否 | `string \| undefined` |

<!-- source-sha256: 13059af86b72a484b0008fa5a4fb0ed481207d57a7acb285ad0799b419061e95; doc-sha256: 8c93e2e994d7d470f2d15b7f4240919bc51e3da3c4f7324d003b6b9314746e0b -->

## ActionsCopy

异步复制操作的独立导出。

从 `@openagentpack/kit-chat-ui` 导入 `ActionsCopy`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/actions/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/actions.mdx`。
[可编译示例](../examples/content.tsx)

- 与 Actions.Copy 是同一组件。
- 省略 onCopy 时使用浏览器剪贴板，复制失败会显示失败状态。
- 文本为空或正在复制时禁用按钮。

```ts
export function ActionsCopy({ text, onCopy, disabled, label, iconOnly, variant, className, }: ActionsCopyProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `text` | 是 | `string` |
| `onCopy` | 否 | `((text: string) => void \| Promise<void>) \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `label` | 否 | `string \| undefined` |
| `iconOnly` | 否 | `boolean \| undefined` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 13059af86b72a484b0008fa5a4fb0ed481207d57a7acb285ad0799b419061e95; doc-sha256: 8c93e2e994d7d470f2d15b7f4240919bc51e3da3c4f7324d003b6b9314746e0b -->

## ActionsFeedback

受控的点赞和点踩操作的独立导出。

从 `@openagentpack/kit-chat-ui` 导入 `ActionsFeedback`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/actions/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/actions.mdx`。
[可编译示例](../examples/content.tsx)

- 与 Actions.Feedback 是同一组件。
- 必需的 value 为 default、like 或 dislike。再次选择当前项恢复 default。
- 反馈由调用方持久化。

```ts
export function ActionsFeedback({ value, onChange, disabled, variant, className, }: ActionsFeedbackProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `value` | 是 | `ActionsFeedbackValue` |
| `onChange` | 是 | `(value: ActionsFeedbackValue) => void` |
| `disabled` | 否 | `boolean \| undefined` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 13059af86b72a484b0008fa5a4fb0ed481207d57a7acb285ad0799b419061e95; doc-sha256: 8c93e2e994d7d470f2d15b7f4240919bc51e3da3c4f7324d003b6b9314746e0b -->

## Actions.Copy

使用调用方提供的回调或浏览器剪贴板复制文本。

从 `@openagentpack/kit-chat-ui` 导入 `Actions`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/actions/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/actions.mdx`。
[可编译示例](../examples/content.tsx)

- 默认 disabled=false、variant="borderless"。
- onCopy 失败时须返回拒绝的 Promise。

```ts
// Actions.Copy 的类型
({ text, onCopy, disabled, label, iconOnly, variant, className, }: ActionsCopyProps) => JSX.Element
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `text` | 是 | `string` |
| `onCopy` | 否 | `((text: string) => void \| Promise<void>) \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `label` | 否 | `string \| undefined` |
| `iconOnly` | 否 | `boolean \| undefined` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 13059af86b72a484b0008fa5a4fb0ed481207d57a7acb285ad0799b419061e95; doc-sha256: 8c93e2e994d7d470f2d15b7f4240919bc51e3da3c4f7324d003b6b9314746e0b -->

## Actions.Feedback

渲染互斥的受控正向和负向反馈。

从 `@openagentpack/kit-chat-ui` 导入 `Actions`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/actions/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/actions.mdx`。
[可编译示例](../examples/content.tsx)

- 默认 disabled=false、variant="borderless"。
- 后端写入由调用方负责。

```ts
// Actions.Feedback 的类型
({ value, onChange, disabled, variant, className, }: ActionsFeedbackProps) => JSX.Element
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `value` | 是 | `ActionsFeedbackValue` |
| `onChange` | 是 | `(value: ActionsFeedbackValue) => void` |
| `disabled` | 否 | `boolean \| undefined` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 13059af86b72a484b0008fa5a4fb0ed481207d57a7acb285ad0799b419061e95; doc-sha256: 8c93e2e994d7d470f2d15b7f4240919bc51e3da3c4f7324d003b6b9314746e0b -->

## AttachmentFileCard

单个附件状态和移除卡片的独立导出。

从 `@openagentpack/kit-chat-ui` 导入 `AttachmentFileCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/attachments/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/attachments.mdx`。
[可编译示例](../examples/content.tsx)

- 与 Attachments.FileCard 是同一组件。
- 上传中或禁用时隐藏移除，缺少 percent 时显示不确定进度。

```ts
export function AttachmentFileCard({ item, onRemove, disabled, className }: AttachmentFileCardProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `item` | 是 | `AttachmentItem` |
| `onRemove` | 否 | `((item: AttachmentItem) => void) \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: bc8be78d9c58600725cb4594c7dc525d20c295a31bf01dacdd2c9620c69d4d94; doc-sha256: 5f7604d96cf0c6ea3cb857d642731d8c694c961874dbbe2f80ca82feb15c1ded -->

## Attachments

选择、拖放及展示输入文件，上传状态由调用方管理。

从 `@openagentpack/kit-chat-ui` 导入 `Attachments`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/attachments/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/attachments.mdx`。
[可编译示例](../examples/attachment-sender.tsx)

- 默认 items=[]、multiple=true、disabled=false、overflow="wrap"。
- onPick 替换原生选择器，拖放仍需提供 onSelectFiles。
- maxCount 限制原生选择及拖放，粘贴文件时应用同样限制。
- 上传后还需显式将文件挂载到会话。

```ts
export function Attachments(props: AttachmentsProps & RefAttributes<AttachmentsRef>): ReactNode;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `AttachmentItem[] \| undefined` |
| `onSelectFiles` | 否 | `((files: File[]) => void) \| undefined` |
| `onPick` | 否 | `(() => void) \| undefined` |
| `onRemove` | 否 | `((item: AttachmentItem) => void) \| undefined` |
| `accept` | 否 | `string \| undefined` |
| `multiple` | 否 | `boolean \| undefined` |
| `maxCount` | 否 | `number \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `overflow` | 否 | `"wrap" \| "scrollX" \| "scrollY" \| undefined` |
| `placeholder` | 否 | `AttachmentsPlaceholder \| ((type: "inline" \| "drop") => AttachmentsPlaceholder) \| undefined` |
| `getDropContainer` | 否 | `(() => HTMLElement \| null \| undefined) \| undefined` |
| `className` | 否 | `string \| undefined` |
| `classNames` | 否 | `Partial<Record<AttachmentsSemantic, string>> \| undefined` |

<!-- source-sha256: bc8be78d9c58600725cb4594c7dc525d20c295a31bf01dacdd2c9620c69d4d94; doc-sha256: 5f7604d96cf0c6ea3cb857d642731d8c694c961874dbbe2f80ca82feb15c1ded -->

## Attachments.FileCard

展示单个 AttachmentItem，文件选择使用外部组件。

从 `@openagentpack/kit-chat-ui` 导入 `Attachments`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/attachments/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/attachments.mdx`。
[可编译示例](../examples/content.tsx)

- disabled 默认 false。
- onRemove 通知调用方更新本地列表，删除远端文件是独立操作。

```ts
// Attachments.FileCard 的类型
({ item, onRemove, disabled, className }: AttachmentFileCardProps) => JSX.Element
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `item` | 是 | `AttachmentItem` |
| `onRemove` | 否 | `((item: AttachmentItem) => void) \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: bc8be78d9c58600725cb4594c7dc525d20c295a31bf01dacdd2c9620c69d4d94; doc-sha256: 5f7604d96cf0c6ea3cb857d642731d8c694c961874dbbe2f80ca82feb15c1ded -->

## Layout

组合会话导航、页头、限高聊天区和响应式 Agent 资源面板。

从 `@openagentpack/kit-chat-ui` 导入 `Layout`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/layout/index.tsx`。
说明来自 `apps/storybook/content/docs/components/layout.mdx`。
[可编译示例](../examples/layout.tsx)

- sidebar 接受内容或获得 closeSidebar、closeButton 的渲染回调。侧栏尺寸、边框和移动端显示由调用方配置。
- header 可接收移动端菜单开关。省略 header 时，mobileTitle 为移动端备用页头提供标题。
- aside 在桌面端展示右侧停靠面板，在移动端展示全屏弹窗。将 asideOpen 和 onAsideOpenChange 接到页头的资源开关。
- sidebarLabel 使用内置导航标签，fitViewport 默认 true。宿主自行管理视口尺寸时可关闭 fitViewport。
- 路由、身份、会话及待确认状态由调用方持有，通过 dialogs 插槽传入受控弹窗。
- 显式启用 workspace 主题，并提供高度有界的父容器。

```ts
export function Layout({ sidebar, header, mobileTitle, sidebarLabel, dialogs, aside, asideOpen, asideLabel, onAsideOpenChange, fitViewport, children, className, ...props }: LayoutProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sidebar` | 否 | `ReactNode \| ((controls: LayoutSidebarControls) => ReactNode)` |
| `header` | 否 | `((menuToggle: ReactNode) => ReactNode) \| undefined` |
| `mobileTitle` | 否 | `ReactNode` |
| `sidebarLabel` | 否 | `string \| undefined` |
| `dialogs` | 否 | `ReactNode` |
| `aside` | 否 | `ReactNode \| ((controls: LayoutAsideControls) => ReactNode)` |
| `asideOpen` | 否 | `boolean \| undefined` |
| `asideLabel` | 否 | `string \| undefined` |
| `onAsideOpenChange` | 否 | `((open: boolean) => void) \| undefined` |
| `fitViewport` | 否 | `boolean \| undefined` |
| `children` | 是 | `ReactNode` |

<!-- source-sha256: 5305fce0912c73d9c56ad2f77b5b63045e98f807e3e7e28f00c0a30532038069; doc-sha256: b4b2a358b40267f60e515aec2f94b74c8f2f7c4446cf7cfbf5a5b51e542fab74 -->

## Chat

组合消息列表、内联子 Agent 卡片、默认 Sender 和主 Agent 审批。

从 `@openagentpack/kit-chat-ui` 导入 `Chat`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/chat/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chat.mdx`。
[可编译示例](../examples/chat-runtime.tsx)

- 默认 variant=default、turnRunning=false、canSend=true。员工端布局需显式使用 workspace。
- 传入 useChat().multiAgent，以查找子 Agent、浏览只读历史、分页和重试，并保留主会话草稿。
- 子卡片在主消息流中原位展开。
- 传入 skills 启用行内技能标签，将 onSend(text, skills) 适配为 chat.send(text, { skills })。
- 主回合是否结束以主会话为准，审批也只属于主 Agent。无待审批项时传 null。
- 默认输入仅在发送成功且草稿仍未改变时清理。
- 自定义 sender 插槽自行接入发送、停止、生成中和提交禁用状态。
- 更改 scrollKey 重置列表跟随状态，输入框保持挂载。
- composerDisabled 禁用默认输入框但仍允许停止，canSend 只限制提交。

```ts
export function Chat({ messages, variant, turnRunning, sending, canSend, composerDisabled, approvals, onSend, onStop, onArtifactDownload, onArtifactOpen, onCopy, empty, scrollKey, sender, multiAgent, anchorRail, virtualize, skills, }: { messages: ChatMessage[]; variant?: "default" | "workspace"; turnRunning?: boolean; sending?: boolean; canSend?: boolean; composerDisabled?: boolean; approvals?: ReactNode; multiAgent?: ChatMultiAgent; onSend?: (text: string, skills?: string[]) => void | Promise<void>; onStop?: () => void | Promise<void>; onArtifactDownload?: (fileId: string) => void; onArtifactOpen?: (fileId: string, contentType?: string) => void; onCopy?: (text: string) => void | Promise<void>; empty?: ReactNode; scrollKey?: string | null; sender?: ReactNode; skills?: SenderSkill[]; anchorRail?: boolean; virtualize?: boolean; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `messages` | 是 | `ChatMessage[]` |
| `variant` | 否 | `"default" \| "workspace" \| undefined` |
| `turnRunning` | 否 | `boolean \| undefined` |
| `sending` | 否 | `boolean \| undefined` |
| `canSend` | 否 | `boolean \| undefined` |
| `composerDisabled` | 否 | `boolean \| undefined` |
| `approvals` | 否 | `ReactNode` |
| `multiAgent` | 否 | `ChatMultiAgent \| undefined` |
| `onSend` | 否 | `((text: string, skills?: string[]) => void \| Promise<void>) \| undefined` |
| `onStop` | 否 | `(() => void \| Promise<void>) \| undefined` |
| `onArtifactDownload` | 否 | `((fileId: string) => void) \| undefined` |
| `onArtifactOpen` | 否 | `((fileId: string, contentType?: string) => void) \| undefined` |
| `onCopy` | 否 | `((text: string) => void \| Promise<void>) \| undefined` |
| `empty` | 否 | `ReactNode` |
| `scrollKey` | 否 | `string \| null \| undefined` |
| `sender` | 否 | `ReactNode` |
| `skills` | 否 | `SenderSkill[] \| undefined` |
| `anchorRail` | 否 | `boolean \| undefined` |
| `virtualize` | 否 | `boolean \| undefined` |

<!-- source-sha256: a3e1a23afaed96d8dd49b9e2a7b0365379a8831b73872d27f50184af1972c18d; doc-sha256: 54361a1d58d6da70dcc5e8cac4dc89a5f700a3ce669abf5caf77601287bf831b -->

## AgentHeader

显示所选 Agent 和由应用控制的操作区。

从 `@openagentpack/kit-chat-ui` 导入 `AgentHeader`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/agent-header/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/agent-header.mdx`。
[可编译示例](../examples/general.tsx)

- actions 替换默认的新建会话按钮，actions=null 隐藏操作区。
- 创建会话由调用方负责。
- 非空 agents 列表和 onPickAgent 启用受控标题选择器。
- 图标支持图片 URL、相对路径和 Emoji 等文本。

```ts
export function AgentHeader({ agent, agents, onPickAgent, leading, compact, actions, onNewSession, }: AgentHeaderProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `agent` | 是 | `{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; } \| null` |
| `agents` | 否 | `{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; }[] \| undefined` |
| `onPickAgent` | 否 | `((slug: string) => void) \| undefined` |
| `leading` | 否 | `ReactNode` |
| `compact` | 否 | `boolean \| undefined` |
| `actions` | 否 | `ReactNode` |
| `onNewSession` | 否 | `(() => void) \| undefined` |

<!-- source-sha256: 973f5f28c434e1ccdb8639164c0adee97ef4576844c1a74008d73a47f376024d; doc-sha256: eeba17b1fd6a1c5d4f3b72aa737b0c950b6f8961539537c5b5b4e40e9ee69947 -->

## isIconImageSource

自定义 Agent 图标布局可复用统一的图标判断规则。

从 `@openagentpack/kit-chat-ui` 导入 `isIconImageSource`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/agent-header/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/agent-header.mdx`。
[可编译示例](../examples/agent-icon.tsx)

- 仅当值以 http:、https:、data:、/ 或 ./ 开头时返回 true。
- 值缺失或为 Emoji 等文本时返回 false，由调用方展示文本或备用内容。
- 这是纯判断函数，仅检查字符串前缀，图片是否可用由调用方处理。

```ts
export function isIconImageSource(icon: string | undefined): boolean;
```


<!-- source-sha256: 973f5f28c434e1ccdb8639164c0adee97ef4576844c1a74008d73a47f376024d; doc-sha256: eeba17b1fd6a1c5d4f3b72aa737b0c950b6f8961539537c5b5b4e40e9ee69947 -->

## ConfirmDialog

展示显式确认和取消选项。

从 `@openagentpack/kit-chat-ui` 导入 `ConfirmDialog`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/confirm-dialog/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chrome.mdx`。
[可编译示例](../examples/general.tsx)

- danger 默认 true，由调用方按条件挂载。
- Radix AlertDialog 管理焦点限制和恢复。busy 禁用确认、取消以及 Escape。
- 调用方负责计划、本次确认令牌、请求状态及成功后的关闭。

```ts
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel, }: { title: string; body: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `title` | 是 | `string` |
| `body` | 是 | `string` |
| `confirmLabel` | 否 | `string \| undefined` |
| `cancelLabel` | 否 | `string \| undefined` |
| `danger` | 否 | `boolean \| undefined` |
| `busy` | 否 | `boolean \| undefined` |
| `onConfirm` | 是 | `() => void` |
| `onCancel` | 是 | `() => void` |

<!-- source-sha256: b0bb833d643b9621b62086bfbbe4d777aa38e18820fdf44492f012a36bd1064f; doc-sha256: 12ca4909d0e7c74f174e45e582ce408541fd45c81294b645364216ca42c3b8cc -->

## EmptyState

显示带标题和可选提示的空态。

从 `@openagentpack/kit-chat-ui` 导入 `EmptyState`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/empty-state/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chrome.mdx`。
[可编译示例](../examples/general.tsx)


```ts
export function EmptyState({ title, hint, loading, }: { title: string; hint?: string; loading?: boolean; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `title` | 是 | `string` |
| `hint` | 否 | `string \| undefined` |
| `loading` | 否 | `boolean \| undefined` |

<!-- source-sha256: b260dbfdc76ab05f72d1f0c841bee4e1e6a6f026504850bbeab26f4a3e06b164; doc-sha256: 12ca4909d0e7c74f174e45e582ce408541fd45c81294b645364216ca42c3b8cc -->

## ErrorState

展示可访问的错误消息及可选重试操作。

从 `@openagentpack/kit-chat-ui` 导入 `ErrorState`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/error-state/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chrome.mdx`。
[可编译示例](../examples/general.tsx)

- 提供 onRetry 时才显示重试按钮，由调用方定义重试行为。

```ts
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `message` | 是 | `string` |
| `onRetry` | 否 | `(() => void) \| undefined` |

<!-- source-sha256: 4203d974bc97749c08cebbae3602ff40f13f2fafa688112e2f736122c0135557; doc-sha256: 12ca4909d0e7c74f174e45e582ce408541fd45c81294b645364216ca42c3b8cc -->

## SessionSidebar

展示会话目录，包含 Agent 分组按需分页、最近会话、搜索及调用方提供的选择与行操作。

从 `@openagentpack/kit-chat-ui` 导入 `SessionSidebar`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/session-sidebar/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/session-sidebar.mdx`。
[可编译示例](../examples/general.tsx)

- 侧栏外框、品牌页头、新建会话、导航及账号区域由调用方组合。
- 分组与最近会话各有分页状态。展开分组触发 onLoad，onRetry 和 onLoadMore 分别处理重试与加载更多。
- onSelect 返回被点击的会话摘要及区域，导航可直接读取 agent_slug。activeSection 指定高亮区域，activeGroupId 自动展开当前会话分组，其他分组保留原状。
- 行内重命名通过 editing {id, section} 按区域控制。menu 渲染回调接收 (session, section)，编辑只作用于对应区域。
- 传入 sessions 前清理过期索引状态，组件按收到的数据渲染。
- 归档和删除回调须经过应用确认。

```ts
export function SessionSidebar({ groups, recent, loading, error, onReload, activeId, activeSection, activeStatus, activeGroupId, onSelect, onNewChat, menu, editing, onEdited, onEditEnd, actionError, onDismissError, searchInput, onSearchInput, search, agentName, className, }: SessionSidebarProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `groups` | 是 | `SessionSidebarGroup[]` |
| `recent` | 是 | `SessionSidebarPage` |
| `loading` | 否 | `boolean \| undefined` |
| `error` | 否 | `string \| null \| undefined` |
| `onReload` | 否 | `(() => void) \| undefined` |
| `activeId` | 是 | `string \| null` |
| `activeSection` | 否 | `SessionSidebarSection \| undefined` |
| `activeStatus` | 否 | `SessionSidebarActiveStatus \| undefined` |
| `activeGroupId` | 否 | `string \| null \| undefined` |
| `onSelect` | 是 | `(session: SessionSummary, section: SessionSidebarSection) => void` |
| `onNewChat` | 否 | `((groupId: string) => void) \| undefined` |
| `menu` | 否 | `((session: SessionSummary, section: SessionSidebarSection) => ReactNode) \| undefined` |
| `editing` | 否 | `SessionSidebarEditing \| null \| undefined` |
| `onEdited` | 否 | `((id: string, title: string) => void) \| undefined` |
| `onEditEnd` | 否 | `((id: string) => void) \| undefined` |
| `actionError` | 否 | `string \| null \| undefined` |
| `onDismissError` | 否 | `(() => void) \| undefined` |
| `searchInput` | 是 | `string` |
| `onSearchInput` | 是 | `(value: string) => void` |
| `search` | 否 | `SessionSidebarPage \| undefined` |
| `agentName` | 否 | `((slug: string) => string) \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 3dd42209c72e75304599c4b08511c239f7811cd8167238b3c9a9ed4d3b509e91; doc-sha256: 904edfbb286fa103468775f1822e1bebd0bb00b84c28d3b84512a51ccbc7c178 -->

## StatusIndicator

分别显示传输连接与执行阶段。

从 `@openagentpack/kit-chat-ui` 导入 `StatusIndicator`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/status-indicator/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chrome.mdx`。
[可编译示例](../examples/general.tsx)

- 兼容用的必填 Props 为 connected 和 turnRunning。
- 新接入同时传入 phase、connection，并将 streamError 传给 error。

```ts
export function StatusIndicator({ connected, turnRunning, phase, connection, error, variant, }: { connected: boolean; turnRunning: boolean; phase?: "idle" | "running" | "requires_action" | "stopping" | "failed" | "interrupted"; connection?: ConnectionState; error?: { code: string; message: string; } | null; variant?: "default" | "badge"; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `connected` | 是 | `boolean` |
| `turnRunning` | 是 | `boolean` |
| `phase` | 否 | `"requires_action" \| "idle" \| "failed" \| "interrupted" \| "running" \| "stopping" \| undefined` |
| `connection` | 否 | `ConnectionState \| undefined` |
| `error` | 否 | `{ code: string; message: string; } \| null \| undefined` |
| `variant` | 否 | `"default" \| "badge" \| undefined` |

<!-- source-sha256: 3ee51419fa9150e2fbab2d8360e75bfe3ea3742215f33ac6d5c55f146c46c12a; doc-sha256: 12ca4909d0e7c74f174e45e582ce408541fd45c81294b645364216ca42c3b8cc -->

## SubAgentPanel

在资源侧栏中按显示名对会话子 Agent 去重。展开对应名称后展示派发记录，点击任务行在弹窗中打开事件时间线。

从 `@openagentpack/kit-chat-ui` 导入 `SubAgentPanel`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/process/sub-agent-panel/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/sub-agent-panel.mdx`。
[可编译示例](../examples/general.tsx)

- 传入 useChat 的 multiAgent 快照。存在子 Agent 线程时才渲染。
- 弹窗加载子线程自己的事件历史，独立于主消息流的分页。

```ts
export function SubAgentPanel({ multiAgent, className }: { multiAgent?: ChatMultiAgent; className?: string; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `multiAgent` | 否 | `ChatMultiAgent \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 85caf15d54d120f96cb3c366f1f55036eac81c6a696f9579d88cc8af853169c3; doc-sha256: eb8bc408e3da4037865ed69071731708d27744bdf5b37c273ce7ab046908c2cd -->

## ThreadPanel

展示投影后的子线程消息，共用复制和下载回调。

从 `@openagentpack/kit-chat-ui` 导入 `ThreadPanel`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/thread-panel/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chrome.mdx`。
[可编译示例](../examples/general.tsx)

- threads 为空时不渲染。
- 该组件兼容已有消息投影，新会话页可将 multiAgent 传给 Chat。
- 线程发现、历史加载和分页由调用方承担。主回合是否结束以主会话为准。

```ts
export function ThreadPanel({ threads, onArtifactDownload, onCopy, }: { threads: Record<string, ChatMessage[]>; onArtifactDownload?: (fileId: string) => void; onCopy?: (text: string) => void | Promise<void>; }): JSX.Element | null;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `threads` | 是 | `Record<string, ChatMessage[]>` |
| `onArtifactDownload` | 否 | `((fileId: string) => void) \| undefined` |
| `onCopy` | 否 | `((text: string) => void \| Promise<void>) \| undefined` |

<!-- source-sha256: 41703120a5f93b28591213154c8973f39fab25e66176e62d068b374b867f2374; doc-sha256: 12ca4909d0e7c74f174e45e582ce408541fd45c81294b645364216ca42c3b8cc -->

## CodeHighlighter

展示高亮代码，可选行号与复制。

从 `@openagentpack/kit-chat-ui` 导入 `CodeHighlighter`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/code-highlighter/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/code-highlighter.mdx`。
[可编译示例](../examples/content.tsx)

- 默认 copyable=true、showLineNumbers=false，语言缺失时按文本展示。
- 语言不受支持或输入超过 50,000 字符时展示完整纯文本。
- header=false 隐藏头部和其中的复制操作。

```ts
export function CodeHighlighter({ children, lang, header, copyable, showLineNumbers, className, }: CodeHighlighterProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `children` | 是 | `string` |
| `lang` | 否 | `string \| undefined` |
| `header` | 否 | `ReactNode \| (() => ReactNode)` |
| `copyable` | 否 | `boolean \| undefined` |
| `showLineNumbers` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 85cef0f0d23fda3ceeb0b0a9f355247669948d9c1591089ec5e0220a5114bee5; doc-sha256: d4ee9c4c04d6436109d28eae75e0500336e2da8c1a776a73a28d5bbbf4f9199f -->

## FileCard

展示文件标识、缩略图和元数据，打开与下载通过注入的操作处理。

从 `@openagentpack/kit-chat-ui` 导入 `FileCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/file-card/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/file-card.mdx`。
[可编译示例](../examples/content.tsx)

- 默认 loading=false、disabled=false。
- 有 onClick 时以它为主操作，否则使用 onDownload。
- 调用方提供 src 并执行下载。

```ts
export function FileCard({ name, type, src, description, loading, disabled, onClick, onDownload, className, }: FileCardProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `name` | 是 | `string` |
| `type` | 否 | `string \| undefined` |
| `src` | 否 | `string \| undefined` |
| `description` | 否 | `ReactNode` |
| `loading` | 否 | `boolean \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `onClick` | 否 | `(() => void) \| undefined` |
| `onDownload` | 否 | `(() => void) \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: e5cd5d16b1bb2aba14cdee10e5f6fcd39ec71d21e3afbb9350e6afbe39f06ff8; doc-sha256: 57e042b47663a0d1bb06eaaa2d71ef2555ae9655628992670d66fefaeca81144 -->

## Markdown

渲染经净化的 GFM 文本、代码块和完整 Mermaid 围栏。

从 `@openagentpack/kit-chat-ui` 导入 `Markdown`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/markdown/index.tsx`。
说明来自 `apps/storybook/content/docs/components/message.mdx`。
[可编译示例](../examples/content.tsx)

- children 须为字符串。
- 自定义渲染不可信的消息正文时，保留 rehype-sanitize。
- 流式期间未闭合的 Mermaid 围栏按源码展示。

```ts
export function Markdown({ children }: { children: string; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `children` | 是 | `string` |

<!-- source-sha256: 16b48dcaa3c45e0be957d420b7ea1c28d286aab917725c3c724993c86c39dd63; doc-sha256: 360fbe042ded35b656365fc82951419dce8eb5208186907df0e0eef9975520e5 -->

## Mermaid

展示 Mermaid 图表或源码，支持流式过程中的安全回退。

从 `@openagentpack/kit-chat-ui` 导入 `Mermaid`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/mermaid/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/mermaid.mdx`。
[可编译示例](../examples/content.tsx)

- 默认 defaultRenderType="image"、copyable=true、streaming=false。
- 流式生成、无效语法或加载外部资源的语法均回退为源码。
- 在 Mermaid 严格安全模式下将 SVG 作为图片渲染。

```ts
export function Mermaid({ children, header, className, defaultRenderType, copyable, streaming, onRenderTypeChange, }: MermaidProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `children` | 是 | `string` |
| `header` | 否 | `ReactNode` |
| `className` | 否 | `string \| undefined` |
| `defaultRenderType` | 否 | `"code" \| "image" \| undefined` |
| `copyable` | 否 | `boolean \| undefined` |
| `streaming` | 否 | `boolean \| undefined` |
| `onRenderTypeChange` | 否 | `((value: "image" \| "code") => void) \| undefined` |

<!-- source-sha256: 16a6682c5d9b61a0317ca2a870aa7449ebde5d62def45f4aefb97a7e8b336d13; doc-sha256: 14289bef79b85671c3eaf2127d50496ccb2d3e6ab2b22fb12b5e5f778d681a72 -->

## ArtifactCard

将输出产物元数据适配到 FileCard，并注入预览与下载操作。

从 `@openagentpack/kit-chat-ui` 导入 `ArtifactCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/artifact-card/index.tsx`。
说明来自 `apps/storybook/content/docs/components/message.mdx`。
[可编译示例](../examples/content.tsx)

- 用于输出产物，输入文件使用附件组件。
- 调用方提供 filename，以及可选的 contentType、onOpen 和 onDownload。

```ts
export function ArtifactCard({ filename, contentType, onOpen, onDownload, }: { filename: string; contentType?: string; onOpen?: () => void; onDownload?: () => void; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `filename` | 是 | `string` |
| `contentType` | 否 | `string \| undefined` |
| `onOpen` | 否 | `(() => void) \| undefined` |
| `onDownload` | 否 | `(() => void) \| undefined` |

<!-- source-sha256: 8474f358ebfaf2ebaddb3480429f59e1adc9c4b1c651bf6de7d2c109a8ead5a5; doc-sha256: 360fbe042ded35b656365fc82951419dce8eb5208186907df0e0eef9975520e5 -->

## Message

展示一条已投影的 ChatMessage，保持富文本分片顺序和执行状态。

从 `@openagentpack/kit-chat-ui` 导入 `Message`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/message/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/message.mdx`。
[可编译示例](../examples/content.tsx)

- 直接消费由核心层提供的 ChatMessage。Provider SSE 在上层解析。
- 仅组合相邻的文本或推理分片，保留工具及产物的顺序。
- 包含文本的已完成助手消息支持复制。

```ts
export function Message({ message, variant, onArtifactDownload, onArtifactOpen, onCopy, multiAgent, skills, }: MessageProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `message` | 是 | `ChatMessage` |
| `variant` | 否 | `"default" \| "workspace" \| undefined` |
| `onArtifactDownload` | 否 | `((fileId: string) => void) \| undefined` |
| `onArtifactOpen` | 否 | `((fileId: string, contentType?: string) => void) \| undefined` |
| `onCopy` | 否 | `((text: string) => void \| Promise<void>) \| undefined` |
| `multiAgent` | 否 | `ChatMultiAgent \| undefined` |
| `skills` | 否 | `string[] \| undefined` |

<!-- source-sha256: f4e7dacf6a2925f7bc1345eeab48a602833655a2915d386c3030610c96c82717; doc-sha256: 3a329ee9c89c01a72c980dc8eb82dcc5d1de2da02c46a10c8a32bb4e2c38f575 -->

## MessageList

展示可滚动的消息列表、空态和滚动跟随。

从 `@openagentpack/kit-chat-ui` 导入 `MessageList`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/message-list/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/message-list.mdx`。
[可编译示例](../examples/content.tsx)

- autoScroll 默认 true，父容器需设置有界高度。
- 浏览较早消息时暂停跟随，回到底部时恢复。
- 切换 scrollKey 或清空消息会重置跟随状态，autoScroll=false 时始终禁止自动滚动。

```ts
export function MessageList({ messages, variant, onArtifactDownload, onArtifactOpen, onCopy, empty, autoScroll, className, scrollKey, active, historyCursor, pending, pendingLabel, approvals, anchorRail, multiAgent, virtualize, skills, }: { messages: ChatMessage[]; variant?: MessageProps["variant"]; onArtifactDownload?: (fileId: string) => void; onArtifactOpen?: (fileId: string, contentType?: string) => void; onCopy?: (text: string) => void | Promise<void>; empty?: ReactNode; autoScroll?: boolean; className?: string; scrollKey?: string | null; active?: boolean; historyCursor?: string | null; pending?: boolean; pendingLabel?: string; approvals?: ReactNode; anchorRail?: boolean; multiAgent?: ChatMultiAgent; virtualize?: boolean; skills?: string[]; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `messages` | 是 | `ChatMessage[]` |
| `variant` | 否 | `"default" \| "workspace" \| undefined` |
| `onArtifactDownload` | 否 | `((fileId: string) => void) \| undefined` |
| `onArtifactOpen` | 否 | `((fileId: string, contentType?: string) => void) \| undefined` |
| `onCopy` | 否 | `((text: string) => void \| Promise<void>) \| undefined` |
| `empty` | 否 | `ReactNode` |
| `autoScroll` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |
| `scrollKey` | 否 | `string \| null \| undefined` |
| `active` | 否 | `boolean \| undefined` |
| `historyCursor` | 否 | `string \| null \| undefined` |
| `pending` | 否 | `boolean \| undefined` |
| `pendingLabel` | 否 | `string \| undefined` |
| `approvals` | 否 | `ReactNode` |
| `anchorRail` | 否 | `boolean \| undefined` |
| `multiAgent` | 否 | `ChatMultiAgent \| undefined` |
| `virtualize` | 否 | `boolean \| undefined` |
| `skills` | 否 | `string[] \| undefined` |

<!-- source-sha256: 1ad5044d72794364adaa340bb4fa173b882fedcee32a72202cc7de97a7fef22a; doc-sha256: 8f73e7706168cde077440c1a133f7bae090ce7aef01a00c5d790c3e433a383ff -->

## MessageAnchorRail

显示会话右侧锚点轨道。每轮用户消息有一个等距锚点，悬停显示回合标题和回复摘要，并高亮当前回合。

从 `@openagentpack/kit-chat-ui` 导入 `MessageAnchorRail`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/message-anchor-rail/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/message-list.mdx`。
[可编译示例](../examples/general.tsx)

- 至少两个回合时才渲染，小于 md 断点时隐藏。
- MessageList.anchorRail 派生回合，随滚动更新当前锚点。跳转只滚动自身容器。

```ts
export function MessageAnchorRail({ items, activeIndex, onSelect, className, }: { items: readonly MessageAnchorItem[]; activeIndex: number; onSelect?: (index: number) => void; className?: string; }): JSX.Element | null;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 是 | `readonly MessageAnchorItem[]` |
| `activeIndex` | 是 | `number` |
| `onSelect` | 否 | `((index: number) => void) \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: bb09a081acc18a5e5d30d283203d81617614885f30b322666aed2834c20f0de6; doc-sha256: 8f73e7706168cde077440c1a133f7bae090ce7aef01a00c5d790c3e433a383ff -->

## MessageListSkeleton

展示会话加载骨架屏。占位块对应消息布局，用户气泡在右、助手卡片在左，带扫过的微光。

从 `@openagentpack/kit-chat-ui` 导入 `MessageListSkeleton`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/message-skeleton/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/message-list.mdx`。
[可编译示例](../examples/general.tsx)

- 通过 role=status 和 aria-label 让辅助技术读取加载状态，界面只显示占位块。
- 颜色及扫光时序来自 theme.css 的 --kit-skeleton-* token 和 --kit-animate-skeleton。减少动效偏好下显示静态块。

```ts
export function MessageListSkeleton({ className }: { className?: string; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 927b8433350e01de44729ae2cb75d3efb0e2e3b6f8b0f26336f9c7f0f683eae1; doc-sha256: 8f73e7706168cde077440c1a133f7bae090ce7aef01a00c5d790c3e433a383ff -->

## ReasoningBlock

显示可折叠的推理文本和生命周期状态。

从 `@openagentpack/kit-chat-ui` 导入 `ReasoningBlock`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/process/reasoning-block/index.tsx`。
说明来自 `apps/storybook/content/docs/components/message.mdx`。
[可编译示例](../examples/reasoning.tsx)

- 初始折叠，流式期间也如此。内容或状态更新时保留用户的手动展开选择。
- 使用推理分片自己的状态。缺少状态时无法判定完成。
- contentMaxHeight 可覆盖展开内容区默认的 max-h-80。

```ts
export function ReasoningBlock({ text, status, className, contentMaxHeight, }: { text: string; status?: "streaming" | "done" | "failed" | "interrupted"; className?: string; contentMaxHeight?: string; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `text` | 是 | `string` |
| `status` | 否 | `"streaming" \| "failed" \| "done" \| "interrupted" \| undefined` |
| `className` | 否 | `string \| undefined` |
| `contentMaxHeight` | 否 | `string \| undefined` |

<!-- source-sha256: d25e4309d81302cef761e2d838de8c582bb06c678af16c9596b2000ea091b2dd; doc-sha256: 360fbe042ded35b656365fc82951419dce8eb5208186907df0e0eef9975520e5 -->

## ToolCallCard

展示已投影的工具调用、结构化参数、输出和状态。

从 `@openagentpack/kit-chat-ui` 导入 `ToolCallCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/process/tool-call-card/index.tsx`。
说明来自 `apps/storybook/content/docs/components/message.mdx`。
[可编译示例](../examples/content.tsx)

- part 必须是 MessagePart 的 tool 分支。
- 工具执行与审批由相应的业务操作负责。

```ts
export function ToolCallCard({ part, className, contentMaxHeight, }: { part: ToolPart; className?: string; contentMaxHeight?: string; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `part` | 是 | `{ type: "tool"; toolId: string; name: string; status: "running" \| "done" \| "error"; input?: unknown; output?: unknown; startedAt?: string; endedAt?: string; } & { id?: string; }` |
| `className` | 否 | `string \| undefined` |
| `contentMaxHeight` | 否 | `string \| undefined` |

<!-- source-sha256: 0e83fff8a40469748e8a164e4aed57b39bc961c0a66c13a14279023b580416ed; doc-sha256: 360fbe042ded35b656365fc82951419dce8eb5208186907df0e0eef9975520e5 -->

## Prompts

提供开场问题或分组快捷入口，发送由调用方触发。

从 `@openagentpack/kit-chat-ui` 导入 `Prompts`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/prompts/index.tsx`。
说明来自 `apps/storybook/content/docs/components/wake/prompts.mdx`。
[可编译示例](../examples/prompts-suggestion.tsx)

- 默认 items=[]、vertical=false、wrap=false、fadeIn=false、fadeInLeft=false。
- items 为空时不渲染，分组父卡片不可选。
- 由调用方决定填入草稿还是发送。

```ts
export function Prompts({ items, title, onItemClick, vertical, wrap, fadeIn, fadeInLeft, className, classNames, ...rest }: PromptsProps): JSX.Element | null;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `PromptsItem[] \| undefined` |
| `title` | 否 | `ReactNode` |
| `onItemClick` | 否 | `((info: { data: PromptsItem; }) => void) \| undefined` |
| `vertical` | 否 | `boolean \| undefined` |
| `wrap` | 否 | `boolean \| undefined` |
| `fadeIn` | 否 | `boolean \| undefined` |
| `fadeInLeft` | 否 | `boolean \| undefined` |
| `classNames` | 否 | `Partial<Record<PromptsSemantic, string>> \| undefined` |

<!-- source-sha256: 00af1362a81e056f19f3809ab99e9ab691fb8f3b16b50603b5abedbef614d383; doc-sha256: da16e5e1291acba6cef4b9e120584679df38a841002fde7d4ce97c83e7d09dd3 -->

## Sender

编辑、提交或停止消息，并接入调用方管理的附件与建议。

从 `@openagentpack/kit-chat-ui` 导入 `Sender`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/sender/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/sender.mdx`。
[可编译示例](../examples/attachment-sender.tsx)

- 默认 defaultValue=""、submitType="enter"、loading=false、submitDisabled=false、disabled=false、readOnly=false。
- autoSize 默认在一到六行间自适应。
- variant=workspace 把编辑区放在工具栏上方，前缀在左，发送或停止在右。默认 variant 使用行内布局。
- onSubmit 后由调用方清理文本，submitDisabled 禁止提交但保留编辑。
- skills 将已知 /name 标记显示为原子标签，斜杠选择器通过 Suggestion 组合。
- 文件上传和会话挂载由调用方负责。

```ts
export function Sender(props: SenderProps & RefAttributes<SenderRef>): ReactNode;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `variant` | 否 | `"default" \| "workspace" \| undefined` |
| `value` | 否 | `string \| undefined` |
| `defaultValue` | 否 | `string \| undefined` |
| `onChange` | 否 | `((value: string) => void) \| undefined` |
| `onSubmit` | 否 | `((message: string, skills?: string[]) => void) \| undefined` |
| `onCancel` | 否 | `(() => void) \| undefined` |
| `onKeyDown` | 否 | `((event: KeyboardEvent<HTMLDivElement>) => void) \| undefined` |
| `onPasteFile` | 否 | `((files: File[]) => void) \| undefined` |
| `loading` | 否 | `boolean \| undefined` |
| `submitDisabled` | 否 | `boolean \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `readOnly` | 否 | `boolean \| undefined` |
| `placeholder` | 否 | `string \| undefined` |
| `skills` | 否 | `SenderSkill[] \| undefined` |
| `onSelectionChange` | 否 | `((selection: SenderSelection) => void) \| undefined` |
| `submitType` | 否 | `SenderSubmitType \| undefined` |
| `autoSize` | 否 | `boolean \| { minRows?: number; maxRows?: number; } \| undefined` |
| `inputProps` | 否 | `(AriaAttributes & { id?: string; role?: AriaRole; }) \| undefined` |
| `prefix` | 否 | `ReactNode` |
| `suffix` | 否 | `ReactNode \| ((origin: ReactNode, info: { components: SenderComponents; }) => ReactNode)` |
| `header` | 否 | `ReactNode` |
| `footer` | 否 | `ReactNode \| ((info: { components: SenderComponents; }) => ReactNode)` |
| `className` | 否 | `string \| undefined` |
| `classNames` | 否 | `Partial<Record<SenderSemantic, string>> \| undefined` |

<!-- source-sha256: e8d29c3e55ef2889bcff4522591344e5a768f984b77bc1dae7f5b32259fae8a6; doc-sha256: 2895344f2a91513a43d04e0f1764061e5deefea3435f06df64562a8a8297f35f -->

## SenderHeader

可选 Sender 顶部面板的独立导出。

从 `@openagentpack/kit-chat-ui` 导入 `SenderHeader`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/sender/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/sender.mdx`。
[可编译示例](../examples/content.tsx)

- 与 Sender.Header 是同一组件，默认 open=false、closable=true。

```ts
export function SenderHeader({ title, open, onOpenChange, closable, children, className, }: SenderHeaderProps): JSX.Element | null;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `title` | 否 | `ReactNode` |
| `open` | 否 | `boolean \| undefined` |
| `onOpenChange` | 否 | `((open: boolean) => void) \| undefined` |
| `closable` | 否 | `boolean \| undefined` |
| `children` | 否 | `ReactNode` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: e8d29c3e55ef2889bcff4522591344e5a768f984b77bc1dae7f5b32259fae8a6; doc-sha256: 2895344f2a91513a43d04e0f1764061e5deefea3435f06df64562a8a8297f35f -->

## Sender.Header

在文本输入框上方显示受控的可展开面板。

从 `@openagentpack/kit-chat-ui` 导入 `Sender`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/sender/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/sender.mdx`。
[可编译示例](../examples/attachment-sender.tsx)

- 默认 open=false、closable=true。
- 关闭面板后保留附件和输入。

```ts
// Sender.Header 的类型
({ title, open, onOpenChange, closable, children, className, }: SenderHeaderProps) => JSX.Element | null
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `title` | 否 | `ReactNode` |
| `open` | 否 | `boolean \| undefined` |
| `onOpenChange` | 否 | `((open: boolean) => void) \| undefined` |
| `closable` | 否 | `boolean \| undefined` |
| `children` | 否 | `ReactNode` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: e8d29c3e55ef2889bcff4522591344e5a768f984b77bc1dae7f5b32259fae8a6; doc-sha256: 2895344f2a91513a43d04e0f1764061e5deefea3435f06df64562a8a8297f35f -->

## SessionList

展示受控的会话选择、状态标记和由应用管理的行菜单插槽。

从 `@openagentpack/kit-chat-ui` 导入 `SessionList`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/session-list/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/session-list.mdx`。
[可编译示例](../examples/general.tsx)

- sessions、activeId、onSelect 为必填。
- menu 是逐行调用的渲染参数 menu(session)。返回的元素绑定对应会话，由调用方渲染触发器、菜单和选项，onClick 直接读取该会话。
- 行内重命名受控。设置 editingId 进入编辑，onEdited 返回去首尾空格并截断为 120 字符的标题，空值或未变更时跳过。提交或 Escape 触发 onEditEnd，由调用方清理 editingId。
- 组件控制操作槽何时出现，悬停时显示、编辑时隐藏。容器、破坏性操作确认和请求由调用方负责。

```ts
export function SessionList({ sessions, activeId, activeStatus, onSelect, menu, editingId, onEdited, onEditEnd, variant, ariaLabel, className, }: SessionListProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sessions` | 是 | `{ session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; }[]` |
| `activeId` | 是 | `string \| null` |
| `onSelect` | 是 | `(session: SessionSummary) => void` |
| `menu` | 否 | `((session: SessionSummary) => ReactNode) \| undefined` |
| `editingId` | 否 | `string \| null \| undefined` |
| `onEdited` | 否 | `((id: string, title: string) => void) \| undefined` |
| `onEditEnd` | 否 | `((id: string) => void) \| undefined` |
| `activeStatus` | 否 | `"failed" \| "running" \| "attention" \| "completed" \| undefined` |
| `variant` | 否 | `"default" \| "workspace" \| undefined` |
| `ariaLabel` | 否 | `string \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 5da3f33c27deb2a37895390703c80a2bb177c62b0cf02b3148b56f441aa4afc2; doc-sha256: db7bf07a1f5723dec5d14a8a6bb7c1b728e246cef9b5f12d07348b5323a5bd7e -->

## Tooltip

在触发器的上方、下方或侧面显示由悬停或聚焦触发的提示。

从 `@openagentpack/kit-chat-ui` 导入 `Tooltip`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/tooltip/index.tsx`。
说明来自 `apps/storybook/content/docs/components/basic/tooltip.mdx`。
[可编译示例](../examples/general.tsx)

- 触发器行内渲染，截断和布局类通过调用方的 className 传入。
- overflowOnly 只在触发器内容确实被截断时显示浮层。
- 浮层可悬停，外部滚动或调整窗口时隐藏，超过最大高度可在内部滚动，仅在客户端渲染。

```ts
export function Tooltip({ content, side, overflowOnly, className, children, }: { content?: ReactNode; side?: TooltipSide; overflowOnly?: boolean; className?: string; children: ReactNode; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `content` | 否 | `ReactNode` |
| `side` | 否 | `TooltipSide \| undefined` |
| `overflowOnly` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |
| `children` | 是 | `ReactNode` |

<!-- source-sha256: 1d32345e22bfd2a3286ba47f3171cec1fbece41d5dfbd345380905f4ee7592ac; doc-sha256: 8d49aec56b5ab5d4ebc6a01fc7beddc8938e7bfaaa4fae2f5e3378258f55ec70 -->

## Menu

在触发器旁打开可用键盘操作的命令菜单。

从 `@openagentpack/kit-chat-ui` 导入 `Menu`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/menu/index.tsx`。
说明来自 `apps/storybook/content/docs/components/basic/menu.mdx`。
[可编译示例](../examples/general.tsx)

- 基于 Radix DropdownMenu 根组件，受控用法传入 open 和 onOpenChange。

```ts
export function Menu(props: DropdownMenu.DropdownMenuProps): ReactNode | Promise<ReactNode>;
```


<!-- source-sha256: c890a8622f2144663c23f8b7fae949f196a514da132c6accc8dc105b0a31a709; doc-sha256: f1fc3bcbb942bcc7fe7284dcc53571a0c57635a92940ce3860415b7facb39106 -->

## MenuTrigger

标记用于切换菜单的元素。

从 `@openagentpack/kit-chat-ui` 导入 `MenuTrigger`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/menu/index.tsx`。
说明来自 `apps/storybook/content/docs/components/basic/menu.mdx`。
[可编译示例](../examples/general.tsx)

- 使用 asChild 保留自己的按钮样式，Radix 补齐 aria-haspopup 和 aria-expanded。

```ts
export function MenuTrigger(props: DropdownMenu.DropdownMenuTriggerProps & RefAttributes<HTMLButtonElement>): ReactNode;
```


<!-- source-sha256: c890a8622f2144663c23f8b7fae949f196a514da132c6accc8dc105b0a31a709; doc-sha256: f1fc3bcbb942bcc7fe7284dcc53571a0c57635a92940ce3860415b7facb39106 -->

## MenuContent

通过 Portal 渲染带主题的悬浮菜单，包含边框、阴影和入场动效。

从 `@openagentpack/kit-chat-ui` 导入 `MenuContent`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/menu/index.tsx`。
说明来自 `apps/storybook/content/docs/components/basic/menu.mdx`。
[可编译示例](../examples/general.tsx)

- 默认 align=start、sideOffset=6，视口不够时 Radix 会翻转显示方向。

```ts
export function MenuContent(props: Omit<DropdownMenu.DropdownMenuContentProps & RefAttributes<HTMLDivElement>, "ref"> & RefAttributes<HTMLDivElement>): ReactNode;
```


<!-- source-sha256: c890a8622f2144663c23f8b7fae949f196a514da132c6accc8dc105b0a31a709; doc-sha256: f1fc3bcbb942bcc7fe7284dcc53571a0c57635a92940ce3860415b7facb39106 -->

## MenuItem

渲染一个可选菜单行，鼠标悬停和键盘焦点共用高亮。

从 `@openagentpack/kit-chat-ui` 导入 `MenuItem`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/menu/index.tsx`。
说明来自 `apps/storybook/content/docs/components/basic/menu.mdx`。
[可编译示例](../examples/general.tsx)

- 图标和标签直接放进 children，点击或按 Enter 触发 onSelect。

```ts
export function MenuItem(props: Omit<DropdownMenu.DropdownMenuItemProps & RefAttributes<HTMLDivElement>, "ref"> & RefAttributes<HTMLDivElement>): ReactNode;
```


<!-- source-sha256: c890a8622f2144663c23f8b7fae949f196a514da132c6accc8dc105b0a31a709; doc-sha256: f1fc3bcbb942bcc7fe7284dcc53571a0c57635a92940ce3860415b7facb39106 -->

## Suggestion

将可用键盘操作的命令菜单与受控文本输入框组合。

从 `@openagentpack/kit-chat-ui` 导入 `Suggestion`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/suggestion/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/suggestion.mdx`。
[可编译示例](../examples/prompts-suggestion.tsx)

- 默认 items=[]、block=false。未提供 trigger 时，调用 onTrigger 才打开。
- 自动模式接收受控 value、caret 和 trigger。Escape 关闭本次查询，直至查询值变化。
- 将 onKeyDown 和 inputProps 同时传给 Sender，确保 Enter 或 Tab 选择选项时不发送消息。
- 调用方通过 onSelect(value, item, context) 定义筛选后的插入行为。

```ts
export function Suggestion<T = unknown>({ items, value, caret, trigger, filter, open, onOpenChange, onSelect, block, children, className, classNames, }: SuggestionProps<T>): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `SuggestionItem[] \| ((info?: T \| undefined) => SuggestionItem[]) \| undefined` |
| `value` | 否 | `string \| undefined` |
| `caret` | 否 | `number \| undefined` |
| `trigger` | 否 | `string \| ((state: { value: string; caret: number; }) => TriggerQuery \| null) \| undefined` |
| `filter` | 否 | `((item: SuggestionItem, query: string) => boolean) \| undefined` |
| `open` | 否 | `boolean \| undefined` |
| `onOpenChange` | 否 | `((open: boolean) => void) \| undefined` |
| `onSelect` | 否 | `((value: string, item: SuggestionItem, context: SuggestionSelectContext \| undefined) => void) \| undefined` |
| `block` | 否 | `boolean \| undefined` |
| `children` | 是 | `(props: SuggestionRenderProps<T>) => ReactNode` |
| `className` | 否 | `string \| undefined` |
| `classNames` | 否 | `Partial<Record<SuggestionSemantic, string>> \| undefined` |

<!-- source-sha256: 197b4cd2d2ed041441f9641f2f7243f588ad8f8065e813e21edb1a3636240ec1; doc-sha256: f320870970c84a798596399d8c6fc4e526493f31c70f26c3b25195fbaa3d8201 -->

## ToolApprovalCard

审阅真实工具参数并明确允许或拒绝一个待处理调用。

从 `@openagentpack/kit-chat-ui` 导入 `ToolApprovalCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/tool-approval-card/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/tool-approval.mdx`。
[可编译示例](../examples/approval-card.tsx)

- 只有可操作的待审批请求允许做决定。
- 允许和拒绝直接提交，服务端按 Provider 状态再次校验。
- 结果不确定时须刷新。submitted 只表示审批决定已提交。
- 调用方提供 submitApproval、refreshApprovals，以及可选的 stop。

```ts
export function ToolApprovalCard({ approval, onDecision, onRefresh, onStop }: ToolApprovalCardProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `approval` | 是 | `ChatToolApproval` |
| `onDecision` | 是 | `(decision: ToolApprovalDecision) => Promise<void>` |
| `onRefresh` | 是 | `() => Promise<void>` |
| `onStop` | 否 | `(() => void) \| undefined` |

<!-- source-sha256: 2936f17d18c87c78f1a5d01a1ee3cd358415e6214ecb541a1cc64cde8e9bf43a; doc-sha256: 570a32709e28feb4df50231c9f763a09fbc5e19d02b2599f12f1c7b496052cd9 -->

## ToolApprovalGroup

横向分页展示多个待审批工具，每次显示一张卡片。

从 `@openagentpack/kit-chat-ui` 导入 `ToolApprovalGroup`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/tool-approval-group/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/tool-approval.mdx`。
[可编译示例](../examples/approvals.tsx)

- 仅渲染当前项和 1/N 分页指示，决定当前项后自动前往下一个待审批项。
- 只要所选项仍在列表中，手动分页选择就会保留。
- approvals 为空时不渲染，回调与 ToolApprovalCard 相同。

```ts
export function ToolApprovalGroup({ approvals, onDecision, onRefresh, onStop, }: { approvals: ChatToolApproval[]; onDecision: (decision: ToolApprovalDecision) => Promise<void>; onRefresh: () => Promise<void>; onStop?: () => void; }): JSX.Element | null;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `approvals` | 是 | `ChatToolApproval[]` |
| `onDecision` | 是 | `(decision: ToolApprovalDecision) => Promise<void>` |
| `onRefresh` | 是 | `() => Promise<void>` |
| `onStop` | 否 | `(() => void) \| undefined` |

<!-- source-sha256: 3a8c63e9f0ba7f0a97739a167c067352a3dc591f08fa2ac9643fa38bebcb6318; doc-sha256: 570a32709e28feb4df50231c9f763a09fbc5e19d02b2599f12f1c7b496052cd9 -->

## PlazaCard

展示一个广场条目，在打开 Agent 时通知调用方。

从 `@openagentpack/kit-chat-ui` 导入 `PlazaCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/plaza-card/index.tsx`。
说明来自 `apps/storybook/content/docs/components/plaza.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- onOpen 接收条目 slug，导航及会话选择由调用方负责。

```ts
export function PlazaCard({ entry, onOpen }: { entry: PlazaEntry; onOpen: (slug: string) => void; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `entry` | 是 | `{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string \| undefined; }; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; }` |
| `onOpen` | 是 | `(slug: string) => void` |

<!-- source-sha256: 52a50912322f0f0079bc328ce3ae712cabbeed3a23d19fa58349498aa5f522a9; doc-sha256: 5b88f15c4b87393e4e9982e2e7755ea9bc240a16e183e2897157330e0976dee0 -->

## CategoryTabs

受控选择广场分类或推荐标签页。

从 `@openagentpack/kit-chat-ui` 导入 `CategoryTabs`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/category-tabs/index.tsx`。
说明来自 `apps/storybook/content/docs/components/plaza.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 在传入分类的开头插入 featured。
- 分类数据可包含数量，当前界面只展示分类。

```ts
export function CategoryTabs({ categories, active, onChange, }: { categories: { id: PlazaCategory; name: string; count: number; }[]; active: PlazaTabId; onChange: (next: PlazaTabId) => void; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `categories` | 是 | `{ id: PlazaCategory; name: string; count: number; }[]` |
| `active` | 是 | `PlazaTabId` |
| `onChange` | 是 | `(next: PlazaTabId) => void` |

<!-- source-sha256: 604866ef78174c9b730038b761a926684d56aa3d8b92c7880cf7c83ac45f353f; doc-sha256: 5b88f15c4b87393e4e9982e2e7755ea9bc240a16e183e2897157330e0976dee0 -->

## MeterBar

将额度用量展示为有界进度或不限量轨道。

从 `@openagentpack/kit-chat-ui` 导入 `MeterBar`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/meter-bar/index.tsx`。
说明来自 `apps/storybook/content/docs/components/plaza.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 默认 unlimited=false、className=""。
- 填充限制在 0–100%，max 为非正数时不填充。

```ts
export function MeterBar({ value, max, unlimited, className, }: { value: number; max: number; unlimited?: boolean; className?: string; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `value` | 是 | `number` |
| `max` | 是 | `number` |
| `unlimited` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: 64d8b8f5c3509d16176334020d779d4a3464717802f2a779b31be9abd33241e6; doc-sha256: 5b88f15c4b87393e4e9982e2e7755ea9bc240a16e183e2897157330e0976dee0 -->

## ActivityHeatmap

展示调用方提供的每日活动及相对强度。

从 `@openagentpack/kit-chat-ui` 导入 `ActivityHeatmap`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/activity-heatmap/index.tsx`。
说明来自 `apps/storybook/content/docs/components/plaza.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 保留输入顺序，日期字符串须唯一。
- 查询、排序和补齐缺失日期由调用方负责。

```ts
export function ActivityHeatmap({ days }: { days: { day: string; turns: number; }[]; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `days` | 是 | `{ day: string; turns: number; }[]` |

<!-- source-sha256: 52deebaeebf5befb55d6693aa98d5a22024129186683ca4238a3e1265aec4657; doc-sha256: 5b88f15c4b87393e4e9982e2e7755ea9bc240a16e183e2897157330e0976dee0 -->

## SkillGlyph

渲染技能标签和建议条目共用的书本图标。

从 `@openagentpack/kit-chat-ui` 导入 `SkillGlyph`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/sender/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/suggestion.mdx`。
[可编译示例](../examples/prompts-suggestion.tsx)

- 装饰性 SVG 带 aria-hidden=true，尺寸和颜色由 className 指定。
- 可用作 Suggestion 条目图标，使自定义技能选择器与 Sender 的技能标签一致。

```ts
export function SkillGlyph({ className }: { className?: string; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: e8d29c3e55ef2889bcff4522591344e5a768f984b77bc1dae7f5b32259fae8a6; doc-sha256: f320870970c84a798596399d8c6fc4e526493f31c70f26c3b25195fbaa3d8201 -->

## 相关类型

以下公开类型可供离线查阅。

### ActionsClickInfo

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ActionsClickInfo } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `key` | 是 | `string` |
| `item` | 是 | `ActionsItem` |
| `domEvent` | 是 | `MouseEvent<HTMLButtonElement, globalThis.MouseEvent>` |


### ActionsCopyProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ActionsCopyProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `text` | 是 | `string` |
| `onCopy` | 否 | `((text: string) => void \| Promise<void>) \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `label` | 否 | `string \| undefined` |
| `iconOnly` | 否 | `boolean \| undefined` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |


### ActionsFeedbackProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ActionsFeedbackProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `value` | 是 | `ActionsFeedbackValue` |
| `onChange` | 是 | `(value: ActionsFeedbackValue) => void` |
| `disabled` | 否 | `boolean \| undefined` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |


### ActionsFeedbackValue

来自 `@openagentpack/kit-chat-ui`。

```ts
export type ActionsFeedbackValue = "default" | "like" | "dislike";
```



### ActionsItem

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ActionsItem } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `key` | 是 | `string` |
| `label` | 是 | `ReactNode` |
| `icon` | 否 | `ReactNode` |
| `disabled` | 否 | `boolean \| undefined` |
| `danger` | 否 | `boolean \| undefined` |
| `onItemClick` | 否 | `((info: ActionsClickInfo) => void) \| undefined` |
| `subItems` | 否 | `ActionsItem[] \| undefined` |


### ActionsProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ActionsProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `ActionsItem[] \| undefined` |
| `onClick` | 否 | `((info: ActionsClickInfo) => void) \| undefined` |
| `children` | 否 | `ReactNode` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |
| `aria-label` | 否 | `string \| undefined` |


### ActionsVariant

来自 `@openagentpack/kit-chat-ui`。

```ts
export type ActionsVariant = "borderless" | "outlined" | "filled";
```



### AgentHeaderProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { AgentHeaderProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `agent` | 是 | `{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; } \| null` |
| `agents` | 否 | `{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; }[] \| undefined` |
| `onPickAgent` | 否 | `((slug: string) => void) \| undefined` |
| `leading` | 否 | `ReactNode` |
| `compact` | 否 | `boolean \| undefined` |
| `actions` | 否 | `ReactNode` |
| `onNewSession` | 否 | `(() => void) \| undefined` |


### ArtifactDescriptor

来自 `@openagentkit/sdk/protocol`。

```ts
import type { ArtifactDescriptor } from "@openagentkit/sdk/protocol";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `file_id` | 是 | `string` |
| `filename` | 否 | `string \| undefined` |
| `content_type` | 否 | `string \| undefined` |
| `size` | 否 | `number \| undefined` |


### AttachmentFileCardProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { AttachmentFileCardProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `item` | 是 | `AttachmentItem` |
| `onRemove` | 否 | `((item: AttachmentItem) => void) \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |


### AttachmentItem

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { AttachmentItem } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `uid` | 是 | `string` |
| `name` | 是 | `string` |
| `size` | 否 | `number \| undefined` |
| `type` | 否 | `string \| undefined` |
| `status` | 否 | `"error" \| "done" \| "uploading" \| undefined` |
| `percent` | 否 | `number \| undefined` |
| `thumbUrl` | 否 | `string \| undefined` |
| `description` | 否 | `ReactNode` |


### AttachmentRef

来自 `@openagentkit/sdk/protocol`。

```ts
export type AttachmentRef = { file_id: string; filename?: string | undefined; mount_path?: string | undefined; size?: number | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `file_id` | 是 | `string` |
| `filename` | 否 | `string \| undefined` |
| `mount_path` | 否 | `string \| undefined` |
| `size` | 否 | `number \| undefined` |


### AttachmentsPlaceholder

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { AttachmentsPlaceholder } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `icon` | 否 | `ReactNode` |
| `title` | 否 | `ReactNode` |
| `description` | 否 | `ReactNode` |


### AttachmentsProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { AttachmentsProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `AttachmentItem[] \| undefined` |
| `onSelectFiles` | 否 | `((files: File[]) => void) \| undefined` |
| `onPick` | 否 | `(() => void) \| undefined` |
| `onRemove` | 否 | `((item: AttachmentItem) => void) \| undefined` |
| `accept` | 否 | `string \| undefined` |
| `multiple` | 否 | `boolean \| undefined` |
| `maxCount` | 否 | `number \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `overflow` | 否 | `"wrap" \| "scrollX" \| "scrollY" \| undefined` |
| `placeholder` | 否 | `AttachmentsPlaceholder \| ((type: "inline" \| "drop") => AttachmentsPlaceholder) \| undefined` |
| `getDropContainer` | 否 | `(() => HTMLElement \| null \| undefined) \| undefined` |
| `className` | 否 | `string \| undefined` |
| `classNames` | 否 | `Partial<Record<AttachmentsSemantic, string>> \| undefined` |


### AttachmentsRef

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { AttachmentsRef } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `nativeElement` | 是 | `HTMLDivElement \| null` |
| `select` | 是 | `() => void` |


### AttachmentsSemantic

来自 `@openagentpack/kit-chat-ui`。

```ts
export type AttachmentsSemantic = "placeholder" | "root" | "list" | "item" | "drop";
```



### ChatAgentThread

来自 `@openagentkit/sdk/chat`。

```ts
import type { ChatAgentThread } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `id` | 是 | `string` |
| `name` | 是 | `string` |
| `task` | 否 | `string \| undefined` |
| `status` | 是 | `string \| null` |
| `createdAt` | 否 | `string \| undefined` |
| `endedAt` | 否 | `string \| undefined` |
| `messages` | 是 | `ChatMessage[]` |
| `loading` | 是 | `boolean` |
| `error` | 是 | `string \| null` |
| `nextPageToken` | 是 | `string \| null` |
| `historyAvailable` | 是 | `boolean` |
| `loaded` | 是 | `boolean` |


### ChatMessage

来自 `@openagentkit/sdk/messages`。

```ts
import type { ChatMessage } from "@openagentkit/sdk/messages";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `id` | 是 | `string` |
| `role` | 是 | `"user" \| "assistant"` |
| `parts` | 是 | `MessagePart[]` |
| `status` | 是 | `MessageStatus` |
| `threadId` | 否 | `string \| undefined` |
| `createdAt` | 否 | `string \| undefined` |
| `clientMessageId` | 否 | `string \| undefined` |


### ChatMultiAgent

来自 `@openagentkit/sdk/chat`。

```ts
import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `selectedThreadId` | 是 | `string \| null` |
| `threads` | 是 | `ChatAgentThread[]` |
| `loading` | 是 | `boolean` |
| `error` | 是 | `string \| null` |
| `selectThread` | 是 | `(id: string \| null) => void` |
| `refreshThreads` | 是 | `() => Promise<void>` |
| `loadThreadEvents` | 是 | `(id: string, options?: { more?: boolean; retry?: boolean; }) => Promise<void>` |


### ChatToolApproval

来自 `@openagentkit/sdk/chat`。

```ts
export type ChatToolApproval = Omit<{ batch_id: string; call_id: string; request_event_id: string | null; name: string; arguments: unknown; tool_type: string; actionable: boolean; server_label?: string | undefined; session_thread_id?: string | undefined; status?: "pending" | "submitted" | "uncertain" | undefined; result?: "allow" | "deny" | undefined; }, "status"> & { status: "pending" | "submitting" | "submitted" | "uncertain" | "stale"; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `batch_id` | 是 | `string` |
| `call_id` | 是 | `string` |
| `request_event_id` | 是 | `string \| null` |
| `name` | 是 | `string` |
| `arguments` | 是 | `unknown` |
| `tool_type` | 是 | `string` |
| `server_label` | 否 | `string \| undefined` |
| `session_thread_id` | 否 | `string \| undefined` |
| `actionable` | 是 | `boolean` |
| `result` | 否 | `"allow" \| "deny" \| undefined` |
| `status` | 是 | `"pending" \| "submitted" \| "uncertain" \| "submitting" \| "stale"` |


### CodeHighlighterProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { CodeHighlighterProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `children` | 是 | `string` |
| `lang` | 否 | `string \| undefined` |
| `header` | 否 | `ReactNode \| (() => ReactNode)` |
| `copyable` | 否 | `boolean \| undefined` |
| `showLineNumbers` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |


### ConnectionState

来自 `@openagentkit/sdk/chat`。

```ts
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
```



### FileCardProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { FileCardProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `name` | 是 | `string` |
| `type` | 否 | `string \| undefined` |
| `src` | 否 | `string \| undefined` |
| `description` | 否 | `ReactNode` |
| `loading` | 否 | `boolean \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `onClick` | 否 | `(() => void) \| undefined` |
| `onDownload` | 否 | `(() => void) \| undefined` |
| `className` | 否 | `string \| undefined` |


### LayoutAsideControls

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { LayoutAsideControls } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `closeButton` | 是 | `ReactNode` |


### LayoutProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { LayoutProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sidebar` | 否 | `ReactNode \| ((controls: LayoutSidebarControls) => ReactNode)` |
| `header` | 否 | `((menuToggle: ReactNode) => ReactNode) \| undefined` |
| `mobileTitle` | 否 | `ReactNode` |
| `sidebarLabel` | 否 | `string \| undefined` |
| `dialogs` | 否 | `ReactNode` |
| `aside` | 否 | `ReactNode \| ((controls: LayoutAsideControls) => ReactNode)` |
| `asideOpen` | 否 | `boolean \| undefined` |
| `asideLabel` | 否 | `string \| undefined` |
| `onAsideOpenChange` | 否 | `((open: boolean) => void) \| undefined` |
| `fitViewport` | 否 | `boolean \| undefined` |
| `children` | 是 | `ReactNode` |


### LayoutSidebarControls

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { LayoutSidebarControls } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `closeSidebar` | 是 | `() => void` |
| `closeButton` | 是 | `ReactNode` |


### MermaidProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MermaidProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `children` | 是 | `string` |
| `header` | 否 | `ReactNode` |
| `className` | 否 | `string \| undefined` |
| `defaultRenderType` | 否 | `"code" \| "image" \| undefined` |
| `copyable` | 否 | `boolean \| undefined` |
| `streaming` | 否 | `boolean \| undefined` |
| `onRenderTypeChange` | 否 | `((value: "image" \| "code") => void) \| undefined` |


### MessageAnchorItem

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MessageAnchorItem } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `label` | 是 | `string` |
| `summary` | 否 | `string \| undefined` |


### MessagePart

来自 `@openagentkit/sdk/messages`。

```ts
export type MessagePart = ({ type: "text"; text: string; } | { type: "reasoning"; text: string; status?: "streaming" | "done" | "failed" | "interrupted"; startedAt?: string; } | { type: "tool"; toolId: string; name: string; status: "running" | "done" | "error"; input?: unknown; output?: unknown; startedAt?: string; endedAt?: string; } | { type: "artifact"; artifact: ArtifactDescriptor; } | { type: "attachment"; file: AttachmentRef; } | { type: "status"; text: string; } | { type: "sub-agent"; threadId: string; } | { type: "unknown"; label: string; value: unknown; }) & { id?: string; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `type` | 是 | `"unknown" \| "text" \| "status" \| "reasoning" \| "tool" \| "artifact" \| "attachment" \| "sub-agent"` |
| `id` | 否 | `string \| undefined` |


### MessageStatus

来自 `@openagentkit/sdk/messages`。

```ts
export type MessageStatus = "pending" | "streaming" | "failed" | "done" | "interrupted";
```



### PlazaCategory

来自 `@openagentkit/sdk/protocol`。

```ts
export type PlazaCategory = "data" | "general" | "writing" | "coding" | "other";
```



### PlazaEntry

来自 `@openagentkit/sdk/protocol`。

```ts
export type PlazaEntry = { slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" | "general" | "writing" | "coding" | "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string | undefined; }; description?: string | undefined; icon?: string | undefined; opening_remarks?: string | undefined; theme?: { accent?: string | undefined; iconBackground?: string | undefined; } | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `slug` | 是 | `string` |
| `display_name` | 是 | `string` |
| `suggested_prompts` | 是 | `string[]` |
| `capabilities` | 是 | `{ streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }` |
| `category` | 是 | `"data" \| "general" \| "writing" \| "coding" \| "other"` |
| `featured` | 是 | `boolean` |
| `stats` | 是 | `{ mine: boolean; turns_30d: number; last_used_at?: string \| undefined; }` |
| `description` | 否 | `string \| undefined` |
| `icon` | 否 | `string \| undefined` |
| `opening_remarks` | 否 | `string \| undefined` |
| `theme` | 否 | `{ accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined` |


### PlazaTabId

来自 `@openagentpack/kit-chat-ui`。

```ts
export type PlazaTabId = "data" | "general" | "writing" | "coding" | "other" | "featured";
```



### PromptsItem

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { PromptsItem } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `children` | 否 | `PromptsItemBase[] \| undefined` |
| `key` | 是 | `string` |
| `icon` | 否 | `ReactNode` |
| `label` | 否 | `ReactNode` |
| `description` | 否 | `ReactNode` |
| `disabled` | 否 | `boolean \| undefined` |


### PromptsItemBase

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { PromptsItemBase } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `key` | 是 | `string` |
| `icon` | 否 | `ReactNode` |
| `label` | 否 | `ReactNode` |
| `description` | 否 | `ReactNode` |
| `disabled` | 否 | `boolean \| undefined` |


### PromptsProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { PromptsProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `PromptsItem[] \| undefined` |
| `title` | 否 | `ReactNode` |
| `onItemClick` | 否 | `((info: { data: PromptsItem; }) => void) \| undefined` |
| `vertical` | 否 | `boolean \| undefined` |
| `wrap` | 否 | `boolean \| undefined` |
| `fadeIn` | 否 | `boolean \| undefined` |
| `fadeInLeft` | 否 | `boolean \| undefined` |
| `classNames` | 否 | `Partial<Record<PromptsSemantic, string>> \| undefined` |


### PromptsSemantic

来自 `@openagentpack/kit-chat-ui`。

```ts
export type PromptsSemantic = "title" | "root" | "list" | "item" | "itemContent" | "subList" | "subItem";
```



### SenderComponents

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SenderComponents } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `SendButton` | 是 | `({ children }: { children?: ReactNode; }) => JSX.Element` |
| `LoadingButton` | 是 | `({ children }: { children?: ReactNode; }) => JSX.Element` |
| `ClearButton` | 是 | `({ children }: { children?: ReactNode; }) => JSX.Element` |


### SenderHeaderProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SenderHeaderProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `title` | 否 | `ReactNode` |
| `open` | 否 | `boolean \| undefined` |
| `onOpenChange` | 否 | `((open: boolean) => void) \| undefined` |
| `closable` | 否 | `boolean \| undefined` |
| `children` | 否 | `ReactNode` |
| `className` | 否 | `string \| undefined` |


### SenderProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SenderProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `variant` | 否 | `"default" \| "workspace" \| undefined` |
| `value` | 否 | `string \| undefined` |
| `defaultValue` | 否 | `string \| undefined` |
| `onChange` | 否 | `((value: string) => void) \| undefined` |
| `onSubmit` | 否 | `((message: string, skills?: string[]) => void) \| undefined` |
| `onCancel` | 否 | `(() => void) \| undefined` |
| `onKeyDown` | 否 | `((event: KeyboardEvent<HTMLDivElement>) => void) \| undefined` |
| `onPasteFile` | 否 | `((files: File[]) => void) \| undefined` |
| `loading` | 否 | `boolean \| undefined` |
| `submitDisabled` | 否 | `boolean \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `readOnly` | 否 | `boolean \| undefined` |
| `placeholder` | 否 | `string \| undefined` |
| `skills` | 否 | `SenderSkill[] \| undefined` |
| `onSelectionChange` | 否 | `((selection: SenderSelection) => void) \| undefined` |
| `submitType` | 否 | `SenderSubmitType \| undefined` |
| `autoSize` | 否 | `boolean \| { minRows?: number; maxRows?: number; } \| undefined` |
| `inputProps` | 否 | `(AriaAttributes & { id?: string; role?: AriaRole; }) \| undefined` |
| `prefix` | 否 | `ReactNode` |
| `suffix` | 否 | `ReactNode \| ((origin: ReactNode, info: { components: SenderComponents; }) => ReactNode)` |
| `header` | 否 | `ReactNode` |
| `footer` | 否 | `ReactNode \| ((info: { components: SenderComponents; }) => ReactNode)` |
| `className` | 否 | `string \| undefined` |
| `classNames` | 否 | `Partial<Record<SenderSemantic, string>> \| undefined` |


### SenderRef

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SenderRef } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `nativeElement` | 是 | `HTMLFormElement \| null` |
| `inputElement` | 是 | `HTMLDivElement \| null` |
| `focus` | 是 | `() => void` |
| `blur` | 是 | `() => void` |
| `clear` | 是 | `() => void` |
| `insert` | 是 | `(text: string) => void` |
| `replaceRange` | 是 | `(start: number, end: number, text: string) => void` |


### SenderSelection

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SenderSelection } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `start` | 是 | `number` |
| `end` | 是 | `number` |


### SenderSemantic

来自 `@openagentpack/kit-chat-ui`。

```ts
export type SenderSemantic = "input" | "root" | "footer" | "prefix" | "suffix";
```



### SenderSkill

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SenderSkill } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `name` | 是 | `string` |
| `description` | 否 | `string \| undefined` |


### SenderSubmitType

来自 `@openagentpack/kit-chat-ui`。

```ts
export type SenderSubmitType = false | "enter" | "shiftEnter";
```



### SessionListProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SessionListProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sessions` | 是 | `{ session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; }[]` |
| `activeId` | 是 | `string \| null` |
| `onSelect` | 是 | `(session: SessionSummary) => void` |
| `menu` | 否 | `((session: SessionSummary) => ReactNode) \| undefined` |
| `editingId` | 否 | `string \| null \| undefined` |
| `onEdited` | 否 | `((id: string, title: string) => void) \| undefined` |
| `onEditEnd` | 否 | `((id: string) => void) \| undefined` |
| `activeStatus` | 否 | `"failed" \| "running" \| "attention" \| "completed" \| undefined` |
| `variant` | 否 | `"default" \| "workspace" \| undefined` |
| `ariaLabel` | 否 | `string \| undefined` |
| `className` | 否 | `string \| undefined` |


### SessionSidebarActiveStatus

来自 `@openagentpack/kit-chat-ui`。

```ts
export type SessionSidebarActiveStatus = "failed" | "running" | "attention" | "completed";
```



### SessionSidebarEditing

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SessionSidebarEditing } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `id` | 是 | `string` |
| `section` | 是 | `SessionSidebarSection` |


### SessionSidebarGroup

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SessionSidebarGroup } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `id` | 是 | `string` |
| `name` | 是 | `string` |
| `sessions` | 是 | `{ session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; }[]` |
| `initialized` | 否 | `boolean \| undefined` |
| `loading` | 否 | `boolean \| undefined` |
| `loadingMore` | 否 | `boolean \| undefined` |
| `hasMore` | 否 | `boolean \| undefined` |
| `error` | 否 | `string \| null \| undefined` |
| `onLoad` | 否 | `(() => void) \| undefined` |
| `onRetry` | 否 | `(() => void) \| undefined` |
| `onLoadMore` | 否 | `(() => void) \| undefined` |


### SessionSidebarPage

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SessionSidebarPage } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sessions` | 是 | `{ session_id: string; agent_slug: string; created_at: string; title?: string \| undefined; status?: string \| undefined; last_event_at?: string \| undefined; }[]` |
| `initialized` | 否 | `boolean \| undefined` |
| `loading` | 否 | `boolean \| undefined` |
| `loadingMore` | 否 | `boolean \| undefined` |
| `hasMore` | 否 | `boolean \| undefined` |
| `error` | 否 | `string \| null \| undefined` |
| `onLoad` | 否 | `(() => void) \| undefined` |
| `onRetry` | 否 | `(() => void) \| undefined` |
| `onLoadMore` | 否 | `(() => void) \| undefined` |


### SessionSidebarProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SessionSidebarProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `groups` | 是 | `SessionSidebarGroup[]` |
| `recent` | 是 | `SessionSidebarPage` |
| `loading` | 否 | `boolean \| undefined` |
| `error` | 否 | `string \| null \| undefined` |
| `onReload` | 否 | `(() => void) \| undefined` |
| `activeId` | 是 | `string \| null` |
| `activeSection` | 否 | `SessionSidebarSection \| undefined` |
| `activeStatus` | 否 | `SessionSidebarActiveStatus \| undefined` |
| `activeGroupId` | 否 | `string \| null \| undefined` |
| `onSelect` | 是 | `(session: SessionSummary, section: SessionSidebarSection) => void` |
| `onNewChat` | 否 | `((groupId: string) => void) \| undefined` |
| `menu` | 否 | `((session: SessionSummary, section: SessionSidebarSection) => ReactNode) \| undefined` |
| `editing` | 否 | `SessionSidebarEditing \| null \| undefined` |
| `onEdited` | 否 | `((id: string, title: string) => void) \| undefined` |
| `onEditEnd` | 否 | `((id: string) => void) \| undefined` |
| `actionError` | 否 | `string \| null \| undefined` |
| `onDismissError` | 否 | `(() => void) \| undefined` |
| `searchInput` | 是 | `string` |
| `onSearchInput` | 是 | `(value: string) => void` |
| `search` | 否 | `SessionSidebarPage \| undefined` |
| `agentName` | 否 | `((slug: string) => string) \| undefined` |
| `className` | 否 | `string \| undefined` |


### SessionSidebarSection

来自 `@openagentpack/kit-chat-ui`。

```ts
export type SessionSidebarSection = "groups" | "recent";
```



### SessionSummary

来自 `@openagentkit/sdk/protocol`。

```ts
export type SessionSummary = { session_id: string; agent_slug: string; created_at: string; title?: string | undefined; status?: string | undefined; last_event_at?: string | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `session_id` | 是 | `string` |
| `agent_slug` | 是 | `string` |
| `created_at` | 是 | `string` |
| `title` | 否 | `string \| undefined` |
| `status` | 否 | `string \| undefined` |
| `last_event_at` | 否 | `string \| undefined` |


### SuggestionItem

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SuggestionItem } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `label` | 是 | `ReactNode` |
| `value` | 是 | `string` |
| `description` | 否 | `ReactNode` |
| `icon` | 否 | `ReactNode` |
| `extra` | 否 | `ReactNode` |
| `children` | 否 | `SuggestionItem[] \| undefined` |
| `keywords` | 否 | `string[] \| undefined` |
| `data` | 否 | `unknown` |


### SuggestionProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SuggestionProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `SuggestionItem[] \| ((info?: T) => SuggestionItem[]) \| undefined` |
| `value` | 否 | `string \| undefined` |
| `caret` | 否 | `number \| undefined` |
| `trigger` | 否 | `string \| ((state: { value: string; caret: number; }) => TriggerQuery \| null) \| undefined` |
| `filter` | 否 | `((item: SuggestionItem, query: string) => boolean) \| undefined` |
| `open` | 否 | `boolean \| undefined` |
| `onOpenChange` | 否 | `((open: boolean) => void) \| undefined` |
| `onSelect` | 否 | `((value: string, item: SuggestionItem, context: SuggestionSelectContext \| undefined) => void) \| undefined` |
| `block` | 否 | `boolean \| undefined` |
| `children` | 是 | `(props: SuggestionRenderProps<T>) => ReactNode` |
| `className` | 否 | `string \| undefined` |
| `classNames` | 否 | `Partial<Record<SuggestionSemantic, string>> \| undefined` |


### SuggestionRenderProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SuggestionRenderProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `onTrigger` | 是 | `(info?: T \| false) => void` |
| `onKeyDown` | 是 | `(event: KeyboardEvent<HTMLElement>) => void` |
| `inputProps` | 是 | `AriaAttributes & { role: "combobox"; }` |
| `query` | 否 | `string \| undefined` |


### SuggestionSelectContext

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SuggestionSelectContext } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `trigger` | 是 | `string` |
| `query` | 是 | `string` |
| `start` | 是 | `number` |
| `end` | 是 | `number` |


### SuggestionSemantic

来自 `@openagentpack/kit-chat-ui`。

```ts
export type SuggestionSemantic = "root" | "list" | "item" | "popup";
```



### ToolApprovalCardProps

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ToolApprovalCardProps } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `approval` | 是 | `ChatToolApproval` |
| `onDecision` | 是 | `(decision: ToolApprovalDecision) => Promise<void>` |
| `onRefresh` | 是 | `() => Promise<void>` |
| `onStop` | 否 | `(() => void) \| undefined` |


### ToolApprovalDecision

来自 `@openagentkit/sdk/protocol`。

```ts
export type ToolApprovalDecision = { batch_id: string; call_id: string; result: "allow" | "deny"; deny_message?: string | undefined; };
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `batch_id` | 是 | `string` |
| `call_id` | 是 | `string` |
| `result` | 是 | `"allow" \| "deny"` |
| `deny_message` | 否 | `string \| undefined` |


### TooltipSide

来自 `@openagentpack/kit-chat-ui`。

```ts
export type TooltipSide = "top" | "bottom" | "left" | "right";
```
