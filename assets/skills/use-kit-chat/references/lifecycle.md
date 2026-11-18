# 会话生命周期

## 状态与受理

Provider 定义消息转换策略。Chat 持有最新事件账本并在重建时调用该策略，重建后的消息纳入控制器快照。
`useChat` 使用这些消息。即使自定义策略改变展示，执行和审批状态仍由 Chat 持有。

`connection` 可为 `disconnected`、`connecting`、`connected` 或 `reconnecting`。
`phase` 可为 `idle`、`running`、`requires_action`、`stopping`、`failed` 或 `interrupted`。
连接和执行独立变化，网络故障时远端仍可能在执行。

`canSend` 综合订阅就绪、执行和会话状态，应直接使用该字段。
等待工具审批或停止确认时，`turnRunning` 保持为真。
`stop()` 成功表示中断请求已受理，最终执行状态由 Provider 事件决定。

`send()` 等到就绪后提交一次，Promise 完成表示受理。控制器负责生成用户乐观消息及对账，
页面直接使用 `messages`，避免重复追加用户消息。

在页面状态中持有受控草稿。只在当前草稿仍与提交文本相符时清理，保留等待期间继续输入的文字。
用 `submitDisabled` 控制提交，保持输入框可编辑。

## 创建后发送

默认后端的 `client.createSession()` 返回真实的 `session_id`。使用自建后端时单独调用创建接口。
在同一处理函数内更新选择并调用 `chat.send(text, { sessionId: createdId })`。
显式指定目标可避免 React 闭包读取旧 ID。首次发送示例复用一个 Hook 和真实会话 ID。

会话尚未创建时 `canSend` 为假。页面可单独启用「创建并发送」操作，先创建会话，失败时保留草稿。
`null` 代表尚无会话。

页面卸载或后端切换后才完成的创建结果不可用于发送。后端可能已经创建会话，可刷新会话列表发现它。
取消浏览器操作后保留会话，由用户决定是否删除。
自建后端示例以当前后端绑定划分会话选择和待处理操作。切换绑定清理旧的忙碌状态与选择，
旧操作完成后不得为新绑定选中会话或结束其忙碌状态。普通重渲染时保持绑定依赖稳定。

## 发送附件

使用 `useAttachments` 上传文件，等后端报告 `available` 后再发送。上传只获得文件引用，
仍需挂载。向已有 Kit 体验会话发送时，把引用传给 `chat.send(text, { attachments })`。
Kit Server 会在发送前挂载，发送失败时尝试撤销本次新增挂载。
发送首条消息时，`useComposer` 将文件传给 `createSession({ agentSlug, files })` 和后续的 `chat.send`。
Kit Server 跳过重复挂载，并将文件关联到受理的消息。已有选中会话时，`useComposer` 直接发送。
消息受理后移除已提交的暂存附件，失败时保留草稿和文件。见[体验示例](../examples/experience.tsx)。
自建后端需显式支持这些操作。

## 生命周期与会话选择

在 React 之外，参考 [controller.ts](../examples/controller.ts) 从公开核心入口导入控制器。
宿主建立订阅，等待 `connect()` 就绪，在生命周期结束时调用 `dispose()` 清理本地资源。
中断远端执行单独走 `stop()`。Hook 的状态和操作也由同一控制器实现。
可选的 `createLocalStore` 示例将 Provider 策略注入 `createSessionStore`。
此时宿主通过 `applyEvent` 交付快照并负责生命周期。只有宿主已持有事件交付时才直接使用 Store，
其他情况使用控制器或 `useChat` 提供的状态。

Hook 负责创建、连接和销毁控制器，并处理 StrictMode。组件可直接使用 Hook 的生命周期管理。
避免在挂载 effect 中调用 `send`，开发模式下 effect 可能执行两次。

Provider 可保存在应用初始化、状态或依赖稳定的 memo 中。Provider 实例改变时替换控制器，
即使会话 ID 相同也会替换。会话 ID 改变会释放旧订阅。卸载时取消订阅，废弃旧绑定的回调。

默认示例用会话 ID 作为面板 key，切换时重置该面板的草稿。若要跨切换保留草稿，
在页面层按会话 ID 存储，尚未创建的会话使用独立草稿 key。

会话选择、多会话缓存、历史导航和文件由应用负责。`threads` 表示消息分组，
会话的创建、查询、更新与删除走独立 API。`artifacts` 描述输出文件，下载接入业务后端，
Provider 凭据或预签名凭据留在后端。

## 多 Agent 视图

无论使用默认 Client 还是自定义 Provider，都可将 `multiAgent={chat.multiAgent}` 传给 `Chat`。
Chat 在主消息流中显示只读子 Agent 卡片。运行中自动展开，打开卡片时按需加载可用历史，
卡片处理分页和重试。主事件游标、执行阶段及工具审批状态由主会话维护。
未配置线程历史查询时，子卡片只展示主订阅中已收到的事件。

展开卡片时，主输入框保持挂载，其停止操作中断主回合。默认和自建后端示例均使用自定义 Sender，
将提交、停止、生成中和禁用提交状态传给它。将 `turnRunning` 传入 Chat 以展示主消息流的等待指示，
主 Agent 无待审批项时传 `approvals=null`。

## 成员用量与删除会话

默认 Kit Server 从 Provider 的累计会话详情读取成员用量。`client.session(id)` 可能含有
`usage`（输入、输出、缓存读取、缓存创建 Token）和 `stats`（活动与总耗时，单位秒）。
缺失指标显示为未知。已有额度按每受理一回合消耗一个 Credit 独立计算。

Kit 成员管理归本仓库的 Console 应用。自建后端接入 Chat UI 时按自有业务接口集成。
通用查询和写入生命周期辅助函数见[调用状态示例](../examples/call-state.ts)。

删除会话仍须审阅计划并在 AlertDialog 中显式确认。对于本地成员的体验会话，服务端先阻止新的写入，
等待进行中的写入完成，中断未完成或等待审批的执行，确认已停止后再读取并保存用量，最后发送 DELETE。
输入及输出计数须有效，缓存与时长缺失时仍保留部分统计。采集失败时阻止删除，但执行可能已经停止。
持久化快照记录 Provider 最后返回的累计值，最终账单由 Provider 结算。

`KitError.details.deletion_uncertain` 为真时保持禁止写入，并提示用户获取新计划后显式重试删除。
服务端对账远端状态并保留快照，重启后也会继续。禁止自动再次发送 DELETE 或通过发送消息补偿。
DELETE 发生网络错误后，即使会话仍存在，删除仍可能已被受理。重新采集时保留此前的不确定状态。
已发送中断后，如果后续发现空闲但采集失败，继续禁止写入，因为先前中断仍可能到达。
服务端维持保护，直到显式确认的删除流程完成。
删除完成后移除常规会话条目，保留成员用量。
