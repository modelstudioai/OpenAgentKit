# 工具审批

使用已有对话结果和 `ToolApprovalCard`。卡片内联显示冻结的工具参数，允许与拒绝均为直接单击提交。
接入 `chat.submitApproval` 和 `chat.refreshApprovals` 两个回调，见[可编译示例](../examples/approval-list.tsx)。

`requires_action` 属于当前回合。草稿保持可编辑，普通提交应禁用。
拒绝只针对一个工具调用，停止整个会话须发起独立中断操作。

| 审批状态 | 交互 |
| --- | --- |
| `pending` 且 `actionable` | 审阅当前参数后允许或拒绝 |
| `submitting` | 阻止重复提交 |
| `submitted` | 等待 Provider 执行事件 |
| `uncertain` | 先刷新，再由用户明确决定是否再次提交 |
| `stale` | 刷新当前待审批集合 |

用当前 `batch_id` 和 `call_id` 标识决定。提交 `result: "allow"` 或 `"deny"`。
可选的 `deny_message` 在 Kit 中最多 200 字符。保留冻结的工具参数，历史审批、未知工具和信息不完整的审批均为只读。

控制器会在提交前刷新待审批集合，并拒绝已变更或失效的确认。后端须独立验证应用身份、
会话归属、当前待审批批次与调用，以及是否已有回复。

响应丢失时，后端可能已收到决定。审批提交禁止自动重试。控制器会尝试查询，若结果仍为
`uncertain`，提供 `refreshApprovals()`。只有刷新后仍可操作的审批才能由用户再次确认。

apply、destroy 和发布等资源操作各自遵循计划和显式确认流程，工具审批的授权仅用于当前工具调用。
