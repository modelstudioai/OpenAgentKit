# API 参考

本页由 `pnpm gen:skills` 生成。更新公开 TypeScript 声明或中文 catalog 后重新生成。
字段类型和必填性来自公开 API，行为说明依据所列文档整理。
组件表格列出 Kit 自有属性。组件按声明继承标准的 React/DOM 属性。
参考中的包名用于仓库内导入。业务项目按[复制组件和 Kit SDK](copy-in.md)改用本地源码入口。

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
- [KitLocaleProvider](#kitlocaleprovider)
- [useKitLocale](#usekitlocale)
- [resolveStrings](#resolvestrings)
- [useKitStrings](#usekitstrings)
- [formatKitStrings](#formatkitstrings)
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
export function Actions({ items, onClick, children, variant, className, "aria-label": ariaLabel, strings: stringsOverride, }: ActionsProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 否 | `ActionsItem[] \| undefined` |
| `onClick` | 否 | `((info: ActionsClickInfo) => void) \| undefined` |
| `children` | 否 | `ReactNode` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |
| `aria-label` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<ActionsStrings> \| undefined` |

<!-- source-sha256: fa99396711a1978cb04b376f3d022b1cf75af84c71c9e3c7207ca29c4ee2247b; doc-sha256: 09fa3779efe27530a71efd6822ee60a4979ae5f94cb6d9e94fb10968b278b058 -->

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
export function ActionsCopy({ text, onCopy, disabled, label, iconOnly, variant, className, strings: stringsOverride, }: ActionsCopyProps): JSX.Element;
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
| `strings` | 否 | `Partial<ActionsStrings> \| undefined` |

<!-- source-sha256: fa99396711a1978cb04b376f3d022b1cf75af84c71c9e3c7207ca29c4ee2247b; doc-sha256: 09fa3779efe27530a71efd6822ee60a4979ae5f94cb6d9e94fb10968b278b058 -->

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
export function ActionsFeedback({ value, onChange, disabled, variant, className, strings: stringsOverride, }: ActionsFeedbackProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `value` | 是 | `ActionsFeedbackValue` |
| `onChange` | 是 | `(value: ActionsFeedbackValue) => void` |
| `disabled` | 否 | `boolean \| undefined` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<ActionsStrings> \| undefined` |

<!-- source-sha256: fa99396711a1978cb04b376f3d022b1cf75af84c71c9e3c7207ca29c4ee2247b; doc-sha256: 09fa3779efe27530a71efd6822ee60a4979ae5f94cb6d9e94fb10968b278b058 -->

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
({ text, onCopy, disabled, label, iconOnly, variant, className, strings: stringsOverride, }: ActionsCopyProps) => JSX.Element
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
| `strings` | 否 | `Partial<ActionsStrings> \| undefined` |

<!-- source-sha256: fa99396711a1978cb04b376f3d022b1cf75af84c71c9e3c7207ca29c4ee2247b; doc-sha256: 09fa3779efe27530a71efd6822ee60a4979ae5f94cb6d9e94fb10968b278b058 -->

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
({ value, onChange, disabled, variant, className, strings: stringsOverride, }: ActionsFeedbackProps) => JSX.Element
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `value` | 是 | `ActionsFeedbackValue` |
| `onChange` | 是 | `(value: ActionsFeedbackValue) => void` |
| `disabled` | 否 | `boolean \| undefined` |
| `variant` | 否 | `ActionsVariant \| undefined` |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<ActionsStrings> \| undefined` |

<!-- source-sha256: fa99396711a1978cb04b376f3d022b1cf75af84c71c9e3c7207ca29c4ee2247b; doc-sha256: 09fa3779efe27530a71efd6822ee60a4979ae5f94cb6d9e94fb10968b278b058 -->

## AttachmentFileCard

单个附件状态和移除卡片的独立导出。

从 `@openagentpack/kit-chat-ui` 导入 `AttachmentFileCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/attachments/index.tsx`。
说明来自 `apps/storybook/content/docs/components/express/attachments.mdx`。
[可编译示例](../examples/content.tsx)

- 与 Attachments.FileCard 是同一组件。
- 上传中或禁用时隐藏移除，缺少 percent 时显示不确定进度。

```ts
export function AttachmentFileCard({ item, onRemove, disabled, className, strings: stringsOverride, }: AttachmentFileCardProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `item` | 是 | `AttachmentItem` |
| `onRemove` | 否 | `((item: AttachmentItem) => void) \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<AttachmentsStrings> \| undefined` |

<!-- source-sha256: a486f07931fe095fb9d9b74c2cd797438852a82c8835c5f0e908505ba0fca5ec; doc-sha256: 5f7604d96cf0c6ea3cb857d642731d8c694c961874dbbe2f80ca82feb15c1ded -->

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
| `strings` | 否 | `Partial<AttachmentsStrings> \| undefined` |

<!-- source-sha256: a486f07931fe095fb9d9b74c2cd797438852a82c8835c5f0e908505ba0fca5ec; doc-sha256: 5f7604d96cf0c6ea3cb857d642731d8c694c961874dbbe2f80ca82feb15c1ded -->

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
({ item, onRemove, disabled, className, strings: stringsOverride, }: AttachmentFileCardProps) => JSX.Element
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `item` | 是 | `AttachmentItem` |
| `onRemove` | 否 | `((item: AttachmentItem) => void) \| undefined` |
| `disabled` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<AttachmentsStrings> \| undefined` |

<!-- source-sha256: a486f07931fe095fb9d9b74c2cd797438852a82c8835c5f0e908505ba0fca5ec; doc-sha256: 5f7604d96cf0c6ea3cb857d642731d8c694c961874dbbe2f80ca82feb15c1ded -->

## Layout

组合会话导航、页头、限高聊天区和响应式 Agent 资源面板。

从 `@openagentpack/kit-chat-ui` 导入 `Layout`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/layout/index.tsx`。
说明来自 `apps/storybook/content/docs/components/layout/index.mdx`。
[可编译示例](../examples/layout.tsx)

- sidebar 接受内容或获得 closeSidebar、closeButton 的渲染回调。侧栏尺寸、边框和移动端显示由调用方配置。
- header 可接收移动端菜单开关。省略 header 时，mobileTitle 为移动端备用页头提供标题。
- aside 在桌面端展示右侧停靠面板，在移动端展示全屏弹窗。将 asideOpen 和 onAsideOpenChange 接到页头的资源开关。
- sidebarLabel 使用内置导航标签，fitViewport 默认 true。宿主自行管理视口尺寸时可关闭 fitViewport。
- 路由、身份、会话及待确认状态由调用方持有，通过 dialogs 插槽传入受控弹窗。
- 显式启用 workspace 主题，并提供高度有界的父容器。

```ts
export function Layout({ sidebar, header, mobileTitle, sidebarLabel, dialogs, aside, asideOpen, asideLabel, onAsideOpenChange, fitViewport, children, className, strings: stringsOverride, ...props }: LayoutProps): JSX.Element;
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
| `strings` | 否 | `Partial<LayoutStrings> \| undefined` |

<!-- source-sha256: 9e6546cbe81d32103e527070ca672962ca7fc798bf82ddba5b37da5b6f6b9e57; doc-sha256: 1d40294aecf09d71714964e2d78ee626297ea742869ea0294f1630069f3c1086 -->

## Chat

组合消息列表、内联子 Agent 卡片、默认 Sender 和主 Agent 审批。

从 `@openagentpack/kit-chat-ui` 导入 `Chat`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/chat/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chat/index.mdx`。
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
export function Chat({ messages, variant, turnRunning, sending, canSend, composerDisabled, approvals, onSend, onStop, onArtifactDownload, onArtifactOpen, onCopy, empty, scrollKey, sender, multiAgent, anchorRail, virtualize, skills, strings: stringsOverride, }: { messages: ChatMessage[]; variant?: "default" | "workspace"; turnRunning?: boolean; sending?: boolean; canSend?: boolean; composerDisabled?: boolean; approvals?: ReactNode; multiAgent?: ChatMultiAgent; onSend?: (text: string, skills?: string[]) => void | Promise<void>; onStop?: () => void | Promise<void>; onArtifactDownload?: (fileId: string) => void; onArtifactOpen?: (fileId: string, contentType?: string) => void; onCopy?: (text: string) => void | Promise<void>; empty?: ReactNode; scrollKey?: string | null; sender?: ReactNode; skills?: SenderSkill[]; strings?: Partial<ChatStrings>; anchorRail?: boolean; virtualize?: boolean; }): JSX.Element;
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
| `strings` | 否 | `Partial<ChatStrings> \| undefined` |
| `anchorRail` | 否 | `boolean \| undefined` |
| `virtualize` | 否 | `boolean \| undefined` |

<!-- source-sha256: 6fa1d000a572c779c8b211fc9cdd9bae0710d4c55eba14dda40057ed41dca90b; doc-sha256: 73a4f1ac376d98c23ca86e9b0da824c61b13626a7d618d6f669bdb72a0b1bea4 -->

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
export function AgentHeader({ agent, agents, onPickAgent, leading, compact, actions, onNewSession, strings: stringsOverride, }: AgentHeaderProps): JSX.Element;
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
| `strings` | 否 | `Partial<AgentHeaderStrings> \| undefined` |

<!-- source-sha256: f2cdeb8f46fa6e0b5f480acf9f169c032d8f635b9dbc2722e32c4635ba9f15d1; doc-sha256: eeba17b1fd6a1c5d4f3b72aa737b0c950b6f8961539537c5b5b4e40e9ee69947 -->

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


<!-- source-sha256: f2cdeb8f46fa6e0b5f480acf9f169c032d8f635b9dbc2722e32c4635ba9f15d1; doc-sha256: eeba17b1fd6a1c5d4f3b72aa737b0c950b6f8961539537c5b5b4e40e9ee69947 -->

## KitLocaleProvider

为整棵 chat-ui 子树设定界面语言，未包裹时回落 zh-CN。

从 `@openagentpack/kit-chat-ui` 导入 `KitLocaleProvider`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/kit-i18n/index.ts`。
说明来自 `apps/storybook/content/docs/components/general/i18n.mdx`。
[可编译示例](../examples/locale-provider.tsx)

- locale 仅支持内置词典的 zh-CN 与 en；第三种语言通过组件 strings 覆盖传入自研词典。
- 只影响组件内置文案，不翻译会话内容或调用方数据。

```ts
export function KitLocaleProvider({ locale, children }: { locale: KitLocale; children: ReactNode; }): FunctionComponentElement<ProviderProps<KitLocale>>;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `locale` | 是 | `KitLocale` |
| `children` | 是 | `ReactNode` |

<!-- source-sha256: b84369dd979aed302b24d42e530276c21b8832bfd3e7a98f66cf73f8298f68e5; doc-sha256: 2f9259f59a7faca169f5b8dc7f6cc7d0a609dc802a7d0a8778b1df8de4004c60 -->

## useKitLocale

读取当前 chat-ui 子树的语言。

从 `@openagentpack/kit-chat-ui` 导入 `useKitLocale`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/kit-i18n/index.ts`。
说明来自 `apps/storybook/content/docs/components/general/i18n.mdx`。
[可编译示例](../examples/custom-strings.tsx)

- 返回最近 KitLocaleProvider 的值；缺省 zh-CN。

```ts
export function useKitLocale(): KitLocale;
```


<!-- source-sha256: b84369dd979aed302b24d42e530276c21b8832bfd3e7a98f66cf73f8298f68e5; doc-sha256: 2f9259f59a7faca169f5b8dc7f6cc7d0a609dc802a7d0a8778b1df8de4004c60 -->

## resolveStrings

纯合并：按 locale 取词典并叠加调用方 strings 覆盖。

从 `@openagentpack/kit-chat-ui` 导入 `resolveStrings`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/kit-i18n/index.ts`。
说明来自 `apps/storybook/content/docs/components/general/i18n.mdx`。
[可编译示例](../examples/custom-strings.tsx)

- 无 DOM 依赖，可直接单测；组件内部取词优先用 useKitStrings。

```ts
export function resolveStrings<T extends object>(table: KitStringTable<T>, locale: KitLocale, overrides?: Partial<T>): T;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `zh-CN` | 是 | `T` |
| `en` | 是 | `T` |

<!-- source-sha256: b84369dd979aed302b24d42e530276c21b8832bfd3e7a98f66cf73f8298f68e5; doc-sha256: 2f9259f59a7faca169f5b8dc7f6cc7d0a609dc802a7d0a8778b1df8de4004c60 -->

## useKitStrings

组件内取当前语言的基础词典。

从 `@openagentpack/kit-chat-ui` 导入 `useKitStrings`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/kit-i18n/index.ts`。
说明来自 `apps/storybook/content/docs/components/general/i18n.mdx`。
[可编译示例](../examples/custom-strings.tsx)

- 词典须以 zh-CN 为唯一事实来源，en 键对齐由 pnpm check:i18n 守护。

```ts
export function useKitStrings<T extends object>(table: KitStringTable<T>): T;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `zh-CN` | 是 | `T` |
| `en` | 是 | `T` |

<!-- source-sha256: b84369dd979aed302b24d42e530276c21b8832bfd3e7a98f66cf73f8298f68e5; doc-sha256: 2f9259f59a7faca169f5b8dc7f6cc7d0a609dc802a7d0a8778b1df8de4004c60 -->

## formatKitStrings

把词典字符串里的 {{name}} 占位替换为实际值。

从 `@openagentpack/kit-chat-ui` 导入 `formatKitStrings`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/kit-i18n/index.ts`。
说明来自 `apps/storybook/content/docs/components/general/i18n.mdx`。
[可编译示例](../examples/custom-strings.tsx)

- 词典叶子保持纯字符串，简单插值在渲染时完成；复杂复数形态留给调用方词条。

```ts
export function formatKitStrings(template: string, values: Record<string, string | number>): string;
```


<!-- source-sha256: b84369dd979aed302b24d42e530276c21b8832bfd3e7a98f66cf73f8298f68e5; doc-sha256: 2f9259f59a7faca169f5b8dc7f6cc7d0a609dc802a7d0a8778b1df8de4004c60 -->

## ConfirmDialog

展示显式确认和取消选项。

从 `@openagentpack/kit-chat-ui` 导入 `ConfirmDialog`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/confirm-dialog/index.tsx`。
说明来自 `packages/chat-ui/src/components/confirm-dialog/README.md`。
[可编译示例](../examples/general.tsx)

- danger 默认 true，由调用方按条件挂载。
- Radix AlertDialog 管理焦点限制和恢复。busy 禁用确认、取消以及 Escape。
- 调用方负责计划、本次确认令牌、请求状态及成功后的关闭。

```ts
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel, strings: stringsOverride, }: { title: string; body: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void; strings?: Partial<ConfirmDialogStrings>; }): JSX.Element;
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
| `strings` | 否 | `Partial<ConfirmDialogStrings> \| undefined` |

<!-- source-sha256: 1ab704bfc629d823cd1054b444a3580c9d55af12746cfa02a068a07dc8e806aa; doc-sha256: 6ffeceeff3e5fe1159ba5bad8261c2ee7530183ee5eb57c69ba1bcc699ecb8c6 -->

## EmptyState

显示带标题和可选提示的空态。

从 `@openagentpack/kit-chat-ui` 导入 `EmptyState`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/empty-state/index.tsx`。
说明来自 `packages/chat-ui/src/components/empty-state/README.md`。
[可编译示例](../examples/general.tsx)


```ts
export function EmptyState({ title, hint, loading, }: { title: string; hint?: string; loading?: boolean; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `title` | 是 | `string` |
| `hint` | 否 | `string \| undefined` |
| `loading` | 否 | `boolean \| undefined` |

<!-- source-sha256: b260dbfdc76ab05f72d1f0c841bee4e1e6a6f026504850bbeab26f4a3e06b164; doc-sha256: 2d74a6c0aceab604332c752fc4daabdccbdf3f0dfcebebc8c73a8b78304f0177 -->

## ErrorState

展示可访问的错误消息及可选重试操作。

从 `@openagentpack/kit-chat-ui` 导入 `ErrorState`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/error-state/index.tsx`。
说明来自 `packages/chat-ui/src/components/error-state/README.md`。
[可编译示例](../examples/general.tsx)

- 提供 onRetry 时才显示重试按钮，由调用方定义重试行为。

```ts
export function ErrorState({ message, onRetry, strings: stringsOverride, }: { message: string; onRetry?: () => void; strings?: Partial<ErrorStateStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `message` | 是 | `string` |
| `onRetry` | 否 | `(() => void) \| undefined` |
| `strings` | 否 | `Partial<ErrorStateStrings> \| undefined` |

<!-- source-sha256: c2dab16b318d475b4cb970cd84c6979b871d035f0c983be4e69f2806e67eb497; doc-sha256: 852a01968d53a684c391d7dd2ce84104881a12d7b659ddded0e5b99968ed482d -->

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
export function SessionSidebar({ groups, recent, loading, error, onReload, activeId, activeSection, activeStatus, activeGroupId, onSelect, onNewChat, menu, editing, onEdited, onEditEnd, actionError, onDismissError, searchInput, onSearchInput, search, agentName, className, strings: stringsOverride, }: SessionSidebarProps): JSX.Element;
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
| `strings` | 否 | `Partial<SessionSidebarStrings> \| undefined` |

<!-- source-sha256: 081ec7c5f40d597cb239be9f24424d24b954dde7c688dbbd54bcad09d4a6f7e1; doc-sha256: 904edfbb286fa103468775f1822e1bebd0bb00b84c28d3b84512a51ccbc7c178 -->

## StatusIndicator

分别显示传输连接与执行阶段。

从 `@openagentpack/kit-chat-ui` 导入 `StatusIndicator`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/status-indicator/index.tsx`。
说明来自 `packages/chat-ui/src/components/status-indicator/README.md`。
[可编译示例](../examples/general.tsx)

- 兼容用的必填 Props 为 connected 和 turnRunning。
- 新接入同时传入 phase、connection，并将 streamError 传给 error。

```ts
export function StatusIndicator({ connected, turnRunning, phase, connection, error, variant, strings: stringsOverride, }: { connected: boolean; turnRunning: boolean; phase?: "idle" | "running" | "requires_action" | "stopping" | "failed" | "interrupted"; connection?: ConnectionState; error?: { code: string; message: string; } | null; variant?: "default" | "badge"; strings?: Partial<StatusIndicatorStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `connected` | 是 | `boolean` |
| `turnRunning` | 是 | `boolean` |
| `phase` | 否 | `"requires_action" \| "idle" \| "failed" \| "interrupted" \| "running" \| "stopping" \| undefined` |
| `connection` | 否 | `ConnectionState \| undefined` |
| `error` | 否 | `{ code: string; message: string; } \| null \| undefined` |
| `variant` | 否 | `"default" \| "badge" \| undefined` |
| `strings` | 否 | `Partial<StatusIndicatorStrings> \| undefined` |

<!-- source-sha256: 85f99c827266d9771c957f57f258edd9a234bb550c6fa6f5ae3fa0b9330f749c; doc-sha256: 195a29f2d135f23820d73275616ed66c309d35ef0b559aa2bf62bf41c324dc30 -->

## SubAgentPanel

在资源侧栏中按显示名对会话子 Agent 去重。展开对应名称后展示派发记录，点击任务行在弹窗中打开事件时间线。

从 `@openagentpack/kit-chat-ui` 导入 `SubAgentPanel`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/process/sub-agent-panel/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/sub-agent-panel.mdx`。
[可编译示例](../examples/general.tsx)

- 传入 useChat 的 multiAgent 快照。存在子 Agent 线程时才渲染。
- 弹窗加载子线程自己的事件历史，独立于主消息流的分页。

```ts
export function SubAgentPanel({ multiAgent, className, strings: stringsOverride, }: { multiAgent?: ChatMultiAgent; className?: string; strings?: Partial<SubAgentPanelStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `multiAgent` | 否 | `ChatMultiAgent \| undefined` |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<SubAgentPanelStrings> \| undefined` |

<!-- source-sha256: 43a759780762ddb4e46e1a90b7bbc17cce74b12b8de5904b096a869dec577a42; doc-sha256: 1ee2c85f106f79e267a52deb4dc23487216894d08e0c99ae63132dbf6762ae1c -->

## ThreadPanel

展示投影后的子线程消息，共用复制和下载回调。

从 `@openagentpack/kit-chat-ui` 导入 `ThreadPanel`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/thread-panel/index.tsx`。
说明来自 `packages/chat-ui/src/components/thread-panel/README.md`。
[可编译示例](../examples/general.tsx)

- threads 为空时不渲染。
- 该组件兼容已有消息投影，新会话页可将 multiAgent 传给 Chat。
- 线程发现、历史加载和分页由调用方承担。主回合是否结束以主会话为准。

```ts
export function ThreadPanel({ threads, onArtifactDownload, onCopy, strings: stringsOverride, }: { threads: Record<string, ChatMessage[]>; onArtifactDownload?: (fileId: string) => void; onCopy?: (text: string) => void | Promise<void>; strings?: Partial<ThreadPanelStrings>; }): JSX.Element | null;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `threads` | 是 | `Record<string, ChatMessage[]>` |
| `onArtifactDownload` | 否 | `((fileId: string) => void) \| undefined` |
| `onCopy` | 否 | `((text: string) => void \| Promise<void>) \| undefined` |
| `strings` | 否 | `Partial<ThreadPanelStrings> \| undefined` |

<!-- source-sha256: e7b9f31266f6f6065b4fbf007f50ee028a20022213c2cdf25acc3e079fe2c418; doc-sha256: 2e849505e17287a6a23f965ba61c341c71232039b845aad7da0f01280519b9c3 -->

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
export function CodeHighlighter({ children, lang, header, copyable, showLineNumbers, className, strings: stringsOverride, }: CodeHighlighterProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `children` | 是 | `string` |
| `lang` | 否 | `string \| undefined` |
| `header` | 否 | `ReactNode \| (() => ReactNode)` |
| `copyable` | 否 | `boolean \| undefined` |
| `showLineNumbers` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<CodeHighlighterStrings> \| undefined` |

<!-- source-sha256: dca1a688ae18f78a5be1f416f7e54599996e2a3398c0aa26ed17a3bc9b565bf9; doc-sha256: 5e893c1449ab5b8639063e05c653b1d764952c40713b6214e59972fdcc20c47a -->

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
export function FileCard({ name, type, src, description, loading, disabled, onClick, onDownload, className, strings: stringsOverride, }: FileCardProps): JSX.Element;
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
| `strings` | 否 | `Partial<FileCardStrings> \| undefined` |

<!-- source-sha256: 12c673e559af2e91831d0e189e302fea3e0e7c021e3a2a9bd632294200bb18e4; doc-sha256: 57e042b47663a0d1bb06eaaa2d71ef2555ae9655628992670d66fefaeca81144 -->

## Markdown

渲染经净化的 GFM 文本、代码块和完整 Mermaid 围栏。

从 `@openagentpack/kit-chat-ui` 导入 `Markdown`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/markdown/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/markdown.mdx`。
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

<!-- source-sha256: 8700936187d98c6d58910eec701fa0cf912fd4d36583c5d88c0223635f54fd00; doc-sha256: 5ed5840a8e037d63a4ef6c87c4f4d56f15fbf7587912517cf0d7b8a10a7617db -->

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
export function Mermaid({ children, header, className, defaultRenderType, copyable, streaming, onRenderTypeChange, strings: stringsOverride, }: MermaidProps): JSX.Element;
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
| `strings` | 否 | `Partial<MermaidStrings> \| undefined` |

<!-- source-sha256: 59b154ef6f0910a312bf0fbda14309996079abd1f82e9f2b5a15f74c028e19aa; doc-sha256: 8afd210d59db931e0e97d9f5cca6a4df1bdce57851c63bc9b99e4471be22bde3 -->

## ArtifactCard

将输出产物元数据适配到 FileCard，并注入预览与下载操作。

从 `@openagentpack/kit-chat-ui` 导入 `ArtifactCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/artifact-card/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/artifact-card.mdx`。
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

<!-- source-sha256: 8474f358ebfaf2ebaddb3480429f59e1adc9c4b1c651bf6de7d2c109a8ead5a5; doc-sha256: 61b0db374d8e5680f9270a1ef2776b2787351db904429d5b933fc737c607670b -->

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
export function Message({ message, variant, onArtifactDownload, onArtifactOpen, onCopy, multiAgent, skills, strings: stringsOverride, }: MessageProps): JSX.Element;
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
| `strings` | 否 | `Partial<MessageStrings> \| undefined` |

<!-- source-sha256: 8ceaa1591ac3e7dd207540c126d926d2ab7da8ffd3d3cacea2f6d0c8bfef71ef; doc-sha256: 972f2ad588cb296298d92de703a27f50540d71b87177c53d273e489f0bf2ccbe -->

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
export function MessageList({ messages, variant, onArtifactDownload, onArtifactOpen, onCopy, empty, autoScroll, className, scrollKey, active, historyCursor, pending, pendingLabel, approvals, anchorRail, multiAgent, virtualize, skills, strings: stringsOverride, }: { messages: ChatMessage[]; variant?: MessageProps["variant"]; onArtifactDownload?: (fileId: string) => void; onArtifactOpen?: (fileId: string, contentType?: string) => void; onCopy?: (text: string) => void | Promise<void>; empty?: ReactNode; autoScroll?: boolean; className?: string; scrollKey?: string | null; active?: boolean; historyCursor?: string | null; pending?: boolean; pendingLabel?: string; approvals?: ReactNode; anchorRail?: boolean; multiAgent?: ChatMultiAgent; virtualize?: boolean; skills?: string[]; strings?: Partial<MessageListStrings>; }): JSX.Element;
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
| `strings` | 否 | `Partial<MessageListStrings> \| undefined` |

<!-- source-sha256: f778d38b03f4fcc1da5cedbc5173d3da0254de3bd0a214a01cf233312d15335b; doc-sha256: 8f73e7706168cde077440c1a133f7bae090ce7aef01a00c5d790c3e433a383ff -->

## MessageAnchorRail

显示会话右侧锚点轨道。每轮用户消息有一个等距锚点，悬停显示回合标题和回复摘要，并高亮当前回合。

从 `@openagentpack/kit-chat-ui` 导入 `MessageAnchorRail`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/message-anchor-rail/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/message-list.mdx`。
[可编译示例](../examples/general.tsx)

- 至少两个回合时才渲染，小于 md 断点时隐藏。
- MessageList.anchorRail 派生回合，随滚动更新当前锚点。跳转只滚动自身容器。

```ts
export function MessageAnchorRail({ items, activeIndex, onSelect, className, strings: stringsOverride, }: { items: readonly MessageAnchorItem[]; activeIndex: number; onSelect?: (index: number) => void; className?: string; strings?: Partial<MessageAnchorRailStrings>; }): JSX.Element | null;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `items` | 是 | `readonly MessageAnchorItem[]` |
| `activeIndex` | 是 | `number` |
| `onSelect` | 否 | `((index: number) => void) \| undefined` |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<MessageAnchorRailStrings> \| undefined` |

<!-- source-sha256: c624f9d4eeda781f822015757ff604f3778509dc02f657e5574e564af000d3e6; doc-sha256: 8f73e7706168cde077440c1a133f7bae090ce7aef01a00c5d790c3e433a383ff -->

## MessageListSkeleton

展示会话加载骨架屏。占位块对应消息布局，用户气泡在右、助手卡片在左，带扫过的微光。

从 `@openagentpack/kit-chat-ui` 导入 `MessageListSkeleton`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/message-skeleton/index.tsx`。
说明来自 `apps/storybook/content/docs/components/general/message-list.mdx`。
[可编译示例](../examples/general.tsx)

- 通过 role=status 和 aria-label 让辅助技术读取加载状态，界面只显示占位块。
- 颜色及扫光时序来自 theme.css 的 --kit-skeleton-* token 和 --kit-animate-skeleton。减少动效偏好下显示静态块。

```ts
export function MessageListSkeleton({ className, strings: stringsOverride, }: { className?: string; strings?: Partial<MessageListSkeletonStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<MessageListSkeletonStrings> \| undefined` |

<!-- source-sha256: c9516cf0c0ac8fdad353ca4ff58823fc236bc254d1e2d746144e0c53d62a974e; doc-sha256: 8f73e7706168cde077440c1a133f7bae090ce7aef01a00c5d790c3e433a383ff -->

## ReasoningBlock

显示可折叠的推理文本和生命周期状态。

从 `@openagentpack/kit-chat-ui` 导入 `ReasoningBlock`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/process/reasoning-block/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/reasoning-block.mdx`。
[可编译示例](../examples/reasoning.tsx)

- 初始折叠，流式期间也如此。内容或状态更新时保留用户的手动展开选择。
- 使用推理分片自己的状态。缺少状态时无法判定完成。
- contentMaxHeight 可覆盖展开内容区默认的 max-h-80。

```ts
export function ReasoningBlock({ text, status, className, contentMaxHeight, strings: stringsOverride, }: { text: string; status?: "streaming" | "done" | "failed" | "interrupted"; className?: string; contentMaxHeight?: string; strings?: Partial<ReasoningBlockStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `text` | 是 | `string` |
| `status` | 否 | `"streaming" \| "failed" \| "done" \| "interrupted" \| undefined` |
| `className` | 否 | `string \| undefined` |
| `contentMaxHeight` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<ReasoningBlockStrings> \| undefined` |

<!-- source-sha256: 376893b1e785b5eb700aa63e934c918b83dbe1be10007e0b142ff51517fd05c3; doc-sha256: a714309f1cecee87a5df402f8880edd0100d4b6add06d8fd44f3b615f362915c -->

## ToolCallCard

展示已投影的工具调用、结构化参数、输出和状态。

从 `@openagentpack/kit-chat-ui` 导入 `ToolCallCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/process/tool-call-card/index.tsx`。
说明来自 `apps/storybook/content/docs/components/feedback/tool-call-card.mdx`。
[可编译示例](../examples/content.tsx)

- part 必须是 MessagePart 的 tool 分支。
- 工具执行与审批由相应的业务操作负责。

```ts
export function ToolCallCard({ part, className, contentMaxHeight, strings: stringsOverride, }: { part: ToolPart; className?: string; contentMaxHeight?: string; strings?: Partial<ToolCallCardStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `part` | 是 | `{ type: "tool"; toolId: string; name: string; status: "running" \| "done" \| "error"; input?: unknown; output?: unknown; startedAt?: string; endedAt?: string; } & { id?: string; }` |
| `className` | 否 | `string \| undefined` |
| `contentMaxHeight` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<ToolCallCardStrings> \| undefined` |

<!-- source-sha256: ac4a4090c06d859416385c3e7c1312f033787b4a67492a89873364241b6c50d9; doc-sha256: f32b30a2cf0add6cd26f3ea0ad125937beac9126063c0991b1cd89404a3b06fa -->

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
说明来自 `apps/storybook/content/docs/components/chat/sender.mdx`。
[可编译示例](../examples/attachment-sender.tsx)

- 默认 defaultValue=""、submitType="enter"、loading=false、submitDisabled=false、disabled=false、readOnly=false。
- autoSize 默认在一到六行间自适应。
- variant=workspace 把编辑区放在工具栏上方，前缀在左，发送或停止在右。默认 variant 使用行内布局。
- onSubmit 后由调用方清理文本，submitDisabled 禁止提交但保留编辑。
- skills 将已知 /name 标记显示为原子标签，斜杠选择器通过 Suggestion 组合。
- 文件上传和会话挂载由调用方负责。
- strings 覆盖内置文案；界面语言由 KitLocaleProvider 提供，未提供时回落 zh-CN，词典键对齐由 check:i18n 守护。

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
| `strings` | 否 | `Partial<SenderStrings> \| undefined` |
| `autoSize` | 否 | `boolean \| { minRows?: number; maxRows?: number; } \| undefined` |
| `inputProps` | 否 | `(AriaAttributes & { id?: string; role?: AriaRole; }) \| undefined` |
| `prefix` | 否 | `ReactNode` |
| `suffix` | 否 | `ReactNode \| ((origin: ReactNode, info: { components: SenderComponents; }) => ReactNode)` |
| `header` | 否 | `ReactNode` |
| `footer` | 否 | `ReactNode \| ((info: { components: SenderComponents; }) => ReactNode)` |
| `className` | 否 | `string \| undefined` |
| `classNames` | 否 | `Partial<Record<SenderSemantic, string>> \| undefined` |

<!-- source-sha256: 7ccb271dd634644b959b88b5d7c1b753044cff014a9a7d2369d358c0440f43f7; doc-sha256: c7d9aee07bbd6807d7c0ab1fe9058c06cbe8860e7a5b6569d521e91eb39bff20 -->

## SenderHeader

可选 Sender 顶部面板的独立导出。

从 `@openagentpack/kit-chat-ui` 导入 `SenderHeader`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/sender/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chat/sender.mdx`。
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

<!-- source-sha256: 7ccb271dd634644b959b88b5d7c1b753044cff014a9a7d2369d358c0440f43f7; doc-sha256: c7d9aee07bbd6807d7c0ab1fe9058c06cbe8860e7a5b6569d521e91eb39bff20 -->

## Sender.Header

在文本输入框上方显示受控的可展开面板。

从 `@openagentpack/kit-chat-ui` 导入 `Sender`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/sender/index.tsx`。
说明来自 `apps/storybook/content/docs/components/chat/sender.mdx`。
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

<!-- source-sha256: 7ccb271dd634644b959b88b5d7c1b753044cff014a9a7d2369d358c0440f43f7; doc-sha256: c7d9aee07bbd6807d7c0ab1fe9058c06cbe8860e7a5b6569d521e91eb39bff20 -->

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
export function SessionList({ sessions, activeId, activeStatus, onSelect, menu, editingId, onEdited, onEditEnd, variant, ariaLabel, className, strings: stringsOverride, }: SessionListProps): JSX.Element;
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
| `strings` | 否 | `Partial<SessionListStrings> \| undefined` |
| `className` | 否 | `string \| undefined` |

<!-- source-sha256: bde2e5f32fd6284c16453d739709b6c0a5cdec7b294305353d7c9c3306cd986e; doc-sha256: 7e98a42f3fe62a96e0086427acbec0a8aedf44cbd53b5b86a98eecb383965f64 -->

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
export function Suggestion<T = unknown>({ items, value, caret, trigger, filter, open, onOpenChange, onSelect, block, children, className, classNames, strings: stringsOverride, }: SuggestionProps<T>): JSX.Element;
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
| `strings` | 否 | `Partial<SuggestionStrings> \| undefined` |

<!-- source-sha256: 0cdb0d72da5f47b30d07905b037e3c6a12801b143265c0554e576b4bd9166bfb; doc-sha256: f320870970c84a798596399d8c6fc4e526493f31c70f26c3b25195fbaa3d8201 -->

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
export function ToolApprovalCard({ approval, onDecision, onRefresh, onStop, strings: stringsOverride, }: ToolApprovalCardProps): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `approval` | 是 | `ChatToolApproval` |
| `onDecision` | 是 | `(decision: ToolApprovalDecision) => Promise<void>` |
| `onRefresh` | 是 | `() => Promise<void>` |
| `onStop` | 否 | `(() => void) \| undefined` |
| `strings` | 否 | `Partial<ToolApprovalCardStrings> \| undefined` |

<!-- source-sha256: ac606cfca0ff63fb10cc10faf99d4c4191188231b46b83ee973a217a49a4553e; doc-sha256: 12a12808afa40adb18b50a49ebc352d51a9c057d3091221f55b4ac8096386d79 -->

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
export function ToolApprovalGroup({ approvals, onDecision, onRefresh, onStop, strings: stringsOverride, }: { approvals: ChatToolApproval[]; onDecision: (decision: ToolApprovalDecision) => Promise<void>; onRefresh: () => Promise<void>; onStop?: () => void; strings?: Partial<ToolApprovalGroupStrings>; }): JSX.Element | null;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `approvals` | 是 | `ChatToolApproval[]` |
| `onDecision` | 是 | `(decision: ToolApprovalDecision) => Promise<void>` |
| `onRefresh` | 是 | `() => Promise<void>` |
| `onStop` | 否 | `(() => void) \| undefined` |
| `strings` | 否 | `Partial<ToolApprovalGroupStrings> \| undefined` |

<!-- source-sha256: bae0c5e03c214df3078c3e2ea780b0dc3a8cd49dd929657468ac287b6f8dd88c; doc-sha256: 12a12808afa40adb18b50a49ebc352d51a9c057d3091221f55b4ac8096386d79 -->

## PlazaCard

展示一个广场条目，在打开 Agent 时通知调用方。

从 `@openagentpack/kit-chat-ui` 导入 `PlazaCard`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/plaza-card/index.tsx`。
说明来自 `apps/storybook/content/docs/components/plaza/plaza-card.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- onOpen 接收条目 slug，导航及会话选择由调用方负责。

```ts
export function PlazaCard({ entry, onOpen, strings: stringsOverride, }: { entry: PlazaEntry; onOpen: (slug: string) => void; strings?: Partial<PlazaCardStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `entry` | 是 | `{ slug: string; display_name: string; suggested_prompts: string[]; capabilities: { streaming: boolean; fileUpload: boolean; artifacts: boolean; threads: boolean; reasoning: boolean; }; category: "data" \| "general" \| "writing" \| "coding" \| "other"; featured: boolean; stats: { mine: boolean; turns_30d: number; last_used_at?: string \| undefined; }; description?: string \| undefined; icon?: string \| undefined; opening_remarks?: string \| undefined; theme?: { accent?: string \| undefined; iconBackground?: string \| undefined; } \| undefined; }` |
| `onOpen` | 是 | `(slug: string) => void` |
| `strings` | 否 | `Partial<PlazaCardStrings> \| undefined` |

<!-- source-sha256: d68cf878ae9b356c1ed4d2ce47b159a2f8f8f1a5b210b1c0c03c3e9aa3bfe70c; doc-sha256: 00fdbec74eec86edacd65751237e2c7dae0d005a95db135f8c96c06e48838fda -->

## CategoryTabs

受控选择广场分类或精选标签页。

从 `@openagentpack/kit-chat-ui` 导入 `CategoryTabs`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/category-tabs/index.tsx`。
说明来自 `apps/storybook/content/docs/components/plaza/category-tabs.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 在传入分类的开头插入 featured。
- 分类数据可包含数量，当前界面只展示分类。

```ts
export function CategoryTabs({ categories, active, onChange, strings: stringsOverride, }: { categories: { id: PlazaCategory; name: string; count: number; }[]; active: PlazaTabId; onChange: (next: PlazaTabId) => void; strings?: Partial<CategoryTabsStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `categories` | 是 | `{ id: PlazaCategory; name: string; count: number; }[]` |
| `active` | 是 | `PlazaTabId` |
| `onChange` | 是 | `(next: PlazaTabId) => void` |
| `strings` | 否 | `Partial<CategoryTabsStrings> \| undefined` |

<!-- source-sha256: 369df57e43d930f1871278f9eaecfb2479ee8a51309ba2e1ff6341aea1bfd5b6; doc-sha256: 2979b674d2e2930e9510cc24e0288f30736f6000c986f147956eb275b6cc9b44 -->

## MeterBar

将额度用量展示为有界进度或不限量轨道。

从 `@openagentpack/kit-chat-ui` 导入 `MeterBar`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/meter-bar/index.tsx`。
说明来自 `apps/storybook/content/docs/components/plaza/meter-bar.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 默认 unlimited=false、className=""。
- 填充限制在 0–100%，max 为非正数时不填充。

```ts
export function MeterBar({ value, max, unlimited, className, strings: stringsOverride, }: { value: number; max: number; unlimited?: boolean; className?: string; strings?: Partial<MeterBarStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `value` | 是 | `number` |
| `max` | 是 | `number` |
| `unlimited` | 否 | `boolean \| undefined` |
| `className` | 否 | `string \| undefined` |
| `strings` | 否 | `Partial<MeterBarStrings> \| undefined` |

<!-- source-sha256: 778569f6551270386dbddbbc99b01714ee652d27cd68ea1a1b80b93e48e2702f; doc-sha256: 3dbf6d8bd368edc8f1b141f73342a21a5c7acd1648d2265cac01e857e991d767 -->

## ActivityHeatmap

展示调用方提供的每日活动及相对强度。

从 `@openagentpack/kit-chat-ui` 导入 `ActivityHeatmap`。
公开入口为 `packages/chat-ui/src/index.ts`，声明位于 `packages/chat-ui/src/components/activity-heatmap/index.tsx`。
说明来自 `apps/storybook/content/docs/components/plaza/activity-heatmap.mdx`。
[可编译示例](../examples/discovery-usage.tsx)

- 保留输入顺序，日期字符串须唯一。
- 查询、排序和补齐缺失日期由调用方负责。

```ts
export function ActivityHeatmap({ days, strings: stringsOverride, }: { days: { day: string; turns: number; }[]; strings?: Partial<ActivityHeatmapStrings>; }): JSX.Element;
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `days` | 是 | `{ day: string; turns: number; }[]` |
| `strings` | 否 | `Partial<ActivityHeatmapStrings> \| undefined` |

<!-- source-sha256: aa81f47f0614d72dce971caa259f768e962f7efc4817d4030a4dbf2e659fb769; doc-sha256: e880992b0747553605b97120af39c7ee30f5eb6ea3e57faa6399b7cb06186220 -->

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

<!-- source-sha256: 7ccb271dd634644b959b88b5d7c1b753044cff014a9a7d2369d358c0440f43f7; doc-sha256: f320870970c84a798596399d8c6fc4e526493f31c70f26c3b25195fbaa3d8201 -->

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
| `strings` | 否 | `Partial<ActionsStrings> \| undefined` |


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
| `strings` | 否 | `Partial<ActionsStrings> \| undefined` |


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
| `strings` | 否 | `Partial<ActionsStrings> \| undefined` |


### ActionsStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ActionsStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `listAriaLabel` | 是 | `string` |
| `copy` | 是 | `string` |
| `copying` | 是 | `string` |
| `copied` | 是 | `string` |
| `copyFailed` | 是 | `string` |
| `copyFailedRetry` | 是 | `string` |
| `feedbackAriaLabel` | 是 | `string` |
| `like` | 是 | `string` |
| `dislike` | 是 | `string` |


### ActionsVariant

来自 `@openagentpack/kit-chat-ui`。

```ts
export type ActionsVariant = "borderless" | "outlined" | "filled";
```



### ActivityHeatmapStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ActivityHeatmapStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `empty` | 是 | `string` |
| `day` | 是 | `string` |
| `join` | 是 | `string` |
| `less` | 是 | `string` |
| `more` | 是 | `string` |


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
| `strings` | 否 | `Partial<AgentHeaderStrings> \| undefined` |


### AgentHeaderStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { AgentHeaderStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `noAgent` | 是 | `string` |
| `switchAgent` | 是 | `string` |
| `newSession` | 是 | `string` |


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
| `strings` | 否 | `Partial<AttachmentsStrings> \| undefined` |


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
| `strings` | 否 | `Partial<AttachmentsStrings> \| undefined` |


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



### AttachmentsStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { AttachmentsStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `inlineTitle` | 是 | `string` |
| `inlineDescription` | 是 | `string` |
| `dropTitle` | 是 | `string` |
| `uploading` | 是 | `string` |
| `uploadingPercent` | 是 | `string` |
| `progressAria` | 是 | `string` |
| `uploadFailed` | 是 | `string` |
| `removeAria` | 是 | `string` |
| `addFile` | 是 | `string` |


### CategoryTabsStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { CategoryTabsStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `featured` | 是 | `string` |
| `aria` | 是 | `string` |


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


### ChatStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ChatStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sending` | 是 | `string` |
| `awaitingApproval` | 是 | `string` |


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
| `strings` | 否 | `Partial<CodeHighlighterStrings> \| undefined` |


### CodeHighlighterStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { CodeHighlighterStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `blockAria` | 是 | `string` |
| `copyCode` | 是 | `string` |
| `contentAria` | 是 | `string` |


### ConfirmDialogStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ConfirmDialogStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `confirm` | 是 | `string` |
| `cancel` | 是 | `string` |


### ConnectionState

来自 `@openagentkit/sdk/chat`。

```ts
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
```



### ErrorStateStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ErrorStateStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `heading` | 是 | `string` |
| `retry` | 是 | `string` |


### ExecutionGroupStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ExecutionGroupStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `running` | 是 | `string` |
| `failed` | 是 | `string` |
| `done` | 是 | `string` |
| `aria` | 是 | `string` |
| `steps` | 是 | `string` |


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
| `strings` | 否 | `Partial<FileCardStrings> \| undefined` |


### FileCardStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { FileCardStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `types` | 是 | `{ spreadsheet: string; image: string; audio: string; video: string; text: string; archive: string; }` |
| `loading` | 是 | `string` |
| `open` | 是 | `string` |
| `download` | 是 | `string` |


### KitLocale

来自 `@openagentpack/kit-chat-ui`。

```ts
export type KitLocale = "zh-CN" | "en";
```



### KitStringTable

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { KitStringTable } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `zh-CN` | 是 | `T` |
| `en` | 是 | `T` |


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
| `strings` | 否 | `Partial<LayoutStrings> \| undefined` |


### LayoutSidebarControls

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { LayoutSidebarControls } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `closeSidebar` | 是 | `() => void` |
| `closeButton` | 是 | `ReactNode` |


### LayoutStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { LayoutStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `closeAria` | 是 | `string` |
| `openAria` | 是 | `string` |
| `sidebarLabel` | 是 | `string` |
| `asideLabel` | 是 | `string` |


### MarkdownStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MarkdownStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `table` | 是 | `string` |


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
| `strings` | 否 | `Partial<MermaidStrings> \| undefined` |


### MermaidStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MermaidStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `header` | 是 | `string` |
| `chart` | 是 | `string` |
| `source` | 是 | `string` |
| `copySource` | 是 | `string` |
| `resourceNotice` | 是 | `string` |
| `streamingNotice` | 是 | `string` |
| `renderError` | 是 | `string` |
| `rerender` | 是 | `string` |
| `rendering` | 是 | `string` |


### MessageAnchorItem

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MessageAnchorItem } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `label` | 是 | `string` |
| `summary` | 否 | `string \| undefined` |


### MessageAnchorRailStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MessageAnchorRailStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `toolsCount` | 是 | `string` |
| `attachmentMessage` | 是 | `string` |
| `newTurn` | 是 | `string` |
| `railAria` | 是 | `string` |
| `turnAria` | 是 | `string` |


### MessageListSkeletonStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MessageListSkeletonStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `loading` | 是 | `string` |


### MessageListStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MessageListStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `threadIntro` | 是 | `string` |
| `backToBottom` | 是 | `string` |
| `listAriaLabel` | 是 | `string` |


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



### MessageStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MessageStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `sending` | 是 | `string` |
| `sendFailed` | 是 | `string` |
| `generationFailed` | 是 | `string` |
| `interrupted` | 是 | `string` |
| `unrecognizedPrefix` | 是 | `string` |
| `serializeFallback` | 是 | `string` |
| `actionsAriaLabel` | 是 | `string` |


### MeterBarStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { MeterBarStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `unlimited` | 是 | `string` |
| `used` | 是 | `string` |


### PlazaCardStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { PlazaCardStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `categories` | 是 | `{ general: string; writing: string; coding: string; data: string; other: string; }` |
| `capabilities` | 是 | `{ streaming: string; fileUpload: string; artifacts: string; threads: string; reasoning: string; }` |
| `usedToday` | 是 | `string` |
| `usedYesterday` | 是 | `string` |
| `usedDaysAgo` | 是 | `string` |
| `featured` | 是 | `string` |
| `mine` | 是 | `string` |
| `noDescription` | 是 | `string` |
| `tryAsk` | 是 | `string` |
| `turns30dPrefix` | 是 | `string` |
| `turns30dSuffix` | 是 | `string` |
| `start` | 是 | `string` |


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



### ProcessingIndicatorStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ProcessingIndicatorStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `processing` | 是 | `string` |


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



### ReasoningBlockStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ReasoningBlockStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `streaming` | 是 | `string` |
| `done` | 是 | `string` |
| `failed` | 是 | `string` |
| `interrupted` | 是 | `string` |
| `aria` | 是 | `string` |
| `title` | 是 | `string` |


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
| `strings` | 否 | `Partial<SenderStrings> \| undefined` |
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


### SenderStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SenderStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `send` | 是 | `string` |
| `stop` | 是 | `string` |
| `clear` | 是 | `string` |
| `inputLabel` | 是 | `string` |
| `collapseLabel` | 是 | `string` |
| `placeholderEnter` | 是 | `string` |
| `placeholderShiftEnter` | 是 | `string` |
| `placeholderPlain` | 是 | `string` |


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
| `strings` | 否 | `Partial<SessionListStrings> \| undefined` |
| `className` | 否 | `string \| undefined` |


### SessionListStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SessionListStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `status` | 是 | `{ running: string; attention: string; failed: string; completed: string; }` |
| `archived` | 是 | `string` |
| `renameAria` | 是 | `string` |
| `aria` | 是 | `string` |
| `empty` | 是 | `string` |


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
| `strings` | 否 | `Partial<SessionSidebarStrings> \| undefined` |


### SessionSidebarSection

来自 `@openagentpack/kit-chat-ui`。

```ts
export type SessionSidebarSection = "groups" | "recent";
```



### SessionSidebarStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SessionSidebarStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `searchPlaceholder` | 是 | `string` |
| `closeError` | 是 | `string` |
| `agents` | 是 | `string` |
| `recent` | 是 | `string` |
| `recentSessions` | 是 | `string` |
| `allSessions` | 是 | `string` |
| `sessionsTitle` | 是 | `string` |
| `listAria` | 是 | `string` |
| `searchResultsAria` | 是 | `string` |
| `loadMore` | 是 | `string` |
| `loadingMore` | 是 | `string` |
| `loadingSessions` | 是 | `string` |
| `loadingTitle` | 是 | `string` |
| `emptyTitle` | 是 | `string` |
| `noMatchLoaded` | 是 | `string` |
| `noMatch` | 是 | `string` |
| `noMatchShort` | 是 | `string` |
| `firstUse` | 是 | `string` |
| `firstUseHint` | 是 | `string` |
| `loadedCount` | 是 | `string` |
| `newInGroup` | 是 | `string` |


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


### StatusIndicatorStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { StatusIndicatorStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `idle` | 是 | `string` |
| `running` | 是 | `string` |
| `requiresAction` | 是 | `string` |
| `stopping` | 是 | `string` |
| `failed` | 是 | `string` |
| `interrupted` | 是 | `string` |
| `connecting` | 是 | `string` |
| `reconnecting` | 是 | `string` |
| `error` | 是 | `string` |
| `errorPrefix` | 是 | `string` |


### SubAgentCardStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SubAgentCardStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `failed` | 是 | `string` |
| `completed` | 是 | `string` |
| `completedWithDuration` | 是 | `string` |
| `running` | 是 | `string` |
| `runningElapsed` | 是 | `string` |
| `dotPrefix` | 是 | `string` |
| `loadFailed` | 是 | `string` |
| `retry` | 是 | `string` |
| `loadingMessages` | 是 | `string` |
| `noMessages` | 是 | `string` |
| `currentConnectionOnly` | 是 | `string` |
| `loadEarlier` | 是 | `string` |
| `mainTaskPrefix` | 是 | `string` |
| `aria` | 是 | `string` |
| `label` | 是 | `string` |
| `taskSuffix` | 是 | `string` |


### SubAgentPanelStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SubAgentPanelStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `label` | 是 | `string` |
| `dotCount` | 是 | `string` |
| `timesCount` | 是 | `string` |
| `statusRunning` | 是 | `string` |
| `statusError` | 是 | `string` |
| `failed` | 是 | `string` |
| `running` | 是 | `string` |
| `runningElapsed` | 是 | `string` |
| `completed` | 是 | `string` |
| `completedWithDuration` | 是 | `string` |
| `close` | 是 | `string` |
| `mainTaskPrefix` | 是 | `string` |
| `noTask` | 是 | `string` |


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
| `strings` | 否 | `Partial<SuggestionStrings> \| undefined` |


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



### SuggestionStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { SuggestionStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `shortcut` | 是 | `string` |
| `nextLevel` | 是 | `string` |


### ThreadPanelStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ThreadPanelStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `title` | 是 | `string` |


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
| `strings` | 否 | `Partial<ToolApprovalCardStrings> \| undefined` |


### ToolApprovalCardStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ToolApprovalCardStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `noParams` | 是 | `string` |
| `paramError` | 是 | `string` |
| `status` | 是 | `{ pending: string; submitting: string; submitted: string; uncertain: string; stale: string; }` |
| `deny` | 是 | `string` |
| `allow` | 是 | `string` |
| `submitting` | 是 | `string` |
| `stop` | 是 | `string` |
| `refreshing` | 是 | `string` |
| `refresh` | 是 | `string` |
| `viewParams` | 是 | `string` |
| `submitFailed` | 是 | `string` |
| `refreshFailed` | 是 | `string` |
| `aria` | 是 | `string` |
| `request` | 是 | `string` |
| `unknownTool` | 是 | `string` |
| `unknownType` | 是 | `string` |
| `notActionable` | 是 | `string` |


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


### ToolApprovalGroupStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ToolApprovalGroupStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `previous` | 是 | `string` |
| `next` | 是 | `string` |


### ToolCallCardStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ToolCallCardStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `serializeFallback` | 是 | `string` |
| `status` | 是 | `{ running: string; done: string; error: string; }` |
| `aria` | 是 | `string` |
| `inputParams` | 是 | `string` |
| `result` | 是 | `string` |
| `noDetail` | 是 | `string` |


### ToolSummaryStrings

来自 `@openagentpack/kit-chat-ui`。

```ts
import type { ToolSummaryStrings } from "@openagentpack/kit-chat-ui";
```

| 字段 | 必填 | 类型 |
| --- | --- | --- |
| `verbs` | 是 | `{ readFile: string; writeFile: string; search: string; runCommand: string; }` |


### TooltipSide

来自 `@openagentpack/kit-chat-ui`。

```ts
export type TooltipSide = "top" | "bottom" | "left" | "right";
```
