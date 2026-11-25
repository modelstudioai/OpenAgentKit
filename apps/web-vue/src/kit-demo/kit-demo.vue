<script setup lang="ts">
import type { ChatToolApproval } from "@openagentkit/sdk/chat";
import type { ChatMessage } from "@openagentkit/sdk/messages";
import { composeSkillDirective } from "@openagentkit/sdk/protocol";
import {
	Chat,
	CodeHighlighter,
	ConfirmDialog,
	EmptyState,
	ErrorState,
	Markdown,
	Menu,
	MenuContent,
	MenuItem,
	MenuTrigger,
	Mermaid,
	Sender,
	ToolApprovalGroup,
	Tooltip,
} from "@openagentpack/kit-chat-ui-vue";
import { ref } from "vue";

const confirmOpen = ref(false);
const lastAction = ref("尚未操作");
const lastSent = ref("尚未发送");
const skills = [{ name: "review" }];
const senderRef = ref<{ insert: (text: string) => void } | null>(null);

function textMessage(id: string, role: ChatMessage["role"], text: string): ChatMessage {
	return { id, role, status: "done", createdAt: new Date().toISOString(), parts: [{ type: "text", text }] };
}

const chatMessages = ref<ChatMessage[]>([
	textMessage("u1", "user", "帮我看看会话重连的逻辑"),
	{
		id: "a1",
		role: "assistant",
		status: "done",
		createdAt: new Date().toISOString(),
		parts: [
			{ type: "reasoning", id: "r1", text: "先确认事件流是否已经就绪，再检查续传游标。", status: "done" },
			{
				type: "tool",
				id: "t1",
				toolId: "call_1",
				name: "read_file",
				status: "done",
				input: { path: "src/chat/session-store.ts" },
				output: { ok: true, cursor: "evt_42" },
			},
			{ type: "text", text: "重连使用 `after` 游标续传，事件按 `event_id` 去重。" },
		],
	},
	textMessage("u2", "user", "那工具审批呢？"),
	textMessage("a2", "assistant", "审批走 plan → 显式确认，结果未知时不会自动重发。"),
]);

function onChatSend(text: string, skills?: string[]) {
	const stamp = Date.now();
	chatMessages.value = [
		...chatMessages.value,
		textMessage(`u-${stamp}`, "user", composeSkillDirective(text, skills ?? [])),
		textMessage(`a-${stamp}`, "assistant", skills?.length ? `收到，使用技能：${skills.join("、")}` : `收到：${text}`),
	];
}

const approvals = ref<ChatToolApproval[]>([
	{
		batch_id: "batch-1",
		call_id: "call-1",
		request_event_id: null,
		name: "write_file",
		arguments: { path: "src/app.ts", content: "export const value = 1;" },
		tool_type: "function",
		actionable: true,
		status: "pending",
	},
	{
		batch_id: "batch-1",
		call_id: "call-2",
		request_event_id: null,
		name: "bash",
		arguments: { command: "pnpm --filter web test" },
		tool_type: "function",
		actionable: true,
		status: "pending",
	},
]);
const approvalNote = ref("等待处理");

async function onDecision(decision: { batch_id: string; call_id: string; result: "allow" | "deny" }) {
	approvalNote.value = `${decision.call_id} → ${decision.result === "allow" ? "允许" : "拒绝"}`;
	approvals.value = approvals.value.map((approval) =>
		approval.call_id === decision.call_id ? { ...approval, status: "submitted" } : approval,
	);
}

async function onRefreshApproval() {
	approvalNote.value = "已刷新";
}

function insertReview() {
	senderRef.value?.insert("/review ");
}

const codeSample = `type Session = {
  id: string;
  title: string;
  updated_at: string;
};

export function pickLatest(sessions: Session[]): Session | undefined {
  return [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}`;

const diagram = `flowchart LR
  A[用户发送消息] --> B{会话已就绪?}
  B -- 是 --> C[写入乐观消息]
  B -- 否 --> D[先建会话]
  D --> C
  C --> E[SSE 回放与增量]`;

const streamingDiagram = `flowchart LR
  A[接收 SSE] --> B[归并快照]`;

const markdownSample = `## 会话运行流程

消息先以乐观气泡出现，服务端回执后按事件 ID 收敛。表格用于展示协议字段：

| 字段 | 说明 |
| --- | --- |
| \`event_id\` | 去重与续传游标 |
| \`phase\` | idle / running / requires_action |

- [x] 历史回放
- [x] 实时增量
- [ ] 子线程合并

> 引用块：结果未知的写请求绝不自动重发。

\`\`\`ts
const snapshot = await controller.connect();
console.log(snapshot);
\`\`\`

\`\`\`mermaid
${diagram}
\`\`\`

安全用例（应被丢弃）：<${"script"}>alert("xss")</${"script"}><img src=x onerror="alert(1)" />
`;
</script>

<template>
	<div class="min-h-dvh bg-[var(--kit-bg-subtle)]">
		<header class="border-b border-[var(--kit-border)] bg-[var(--kit-surface)] px-6 py-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 class="text-[length:var(--kit-text-title)] font-semibold">组件画廊（Vue）</h1>
					<p class="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
						S5 验收页：原语、Markdown、代码与图表；不依赖后端，不进生产产物。
					</p>
				</div>
				<div class="flex items-center gap-2 text-[length:var(--kit-text-caption)]">
					<span data-testid="gallery-action" class="text-[var(--kit-fg-muted)]">最近动作：{{ lastAction }}</span>
					<a class="underline underline-offset-4" href="/">返回登录页</a>
				</div>
			</div>
		</header>

		<main class="mx-auto grid max-w-5xl gap-6 px-6 py-8">
			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">1. 确认弹窗（AlertDialog）</h2>
				<p class="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					合同：<code>role="alertdialog"</code>，Esc 取消，点遮罩不关闭，焦点回到触发按钮。
				</p>
				<div class="mt-4">
					<button
						type="button"
						data-testid="open-confirm"
						class="rounded-[var(--kit-radius-sm)] bg-[var(--kit-danger)] px-3 py-2 text-[length:var(--kit-text-label)] font-medium text-[var(--kit-danger-fg)]"
						@click="confirmOpen = true"
					>
						删除会话
					</button>
				</div>
			</section>

			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">2. 命令菜单（DropdownMenu）</h2>
				<p class="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					合同：<code>role="menu"</code> / <code>menuitem</code>，方向键移动、Enter 选择、Esc 关闭。
				</p>
				<div class="mt-4">
					<Menu>
						<MenuTrigger as-child>
							<button
								type="button"
								data-testid="open-menu"
								class="rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-3 py-2 text-[length:var(--kit-text-label)]"
							>
								会话操作
							</button>
						</MenuTrigger>
						<MenuContent>
							<MenuItem @select="lastAction = '重命名'">重命名</MenuItem>
							<MenuItem @select="lastAction = '归档'">归档</MenuItem>
							<MenuItem class="text-[var(--kit-danger)]" @select="lastAction = '删除'">删除</MenuItem>
						</MenuContent>
					</Menu>
				</div>
			</section>

			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">3. 提示气泡（Tooltip）</h2>
				<p class="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					合同：<code>role="tooltip"</code>，悬停与键盘聚焦都显示，移出 150ms 后收起。
				</p>
				<div class="mt-4">
					<Tooltip side="top">
						<span
							tabindex="0"
							class="inline-block max-w-48 truncate rounded-[var(--kit-radius-sm)] border border-dashed border-[var(--kit-border)] px-3 py-2 text-[length:var(--kit-text-label)]"
						>
							很长的会话标题：季度复盘与后续行动计划（悬停查看完整标题）
						</span>
						<template #content>季度复盘与后续行动计划（完整标题）</template>
					</Tooltip>
				</div>
			</section>

			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">4. Markdown（GFM + 代码 + Mermaid）</h2>
				<p class="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					合同：表格包在可聚焦区域；代码块带 <code>data-code-highlighter</code>；原始 HTML/脚本被 sanitize。
				</p>
				<div data-testid="markdown-sample" class="mt-4">
					<Markdown>{{ markdownSample }}</Markdown>
				</div>
			</section>

			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">5. 代码高亮与图表</h2>
				<CodeHighlighter lang="ts" show-line-numbers>{{ codeSample }}</CodeHighlighter>
				<Mermaid :code="diagram" class="mt-4" />
				<Mermaid :code="streamingDiagram" :streaming="true" class="mt-4" />
			</section>

			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">6. 对话输入框（Sender）</h2>
				<p class="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					合同：<code>role="textbox"</code> + contenteditable；chip 由调用方插入技能标记（Suggestion 选中后
					<code>replaceRange</code>），手打 <code>/review</code> 仍是普通文本；Enter 提交、Shift+Enter 换行。
				</p>
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<span class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">技能候选：</span>
					<button
						type="button"
						data-testid="insert-skill"
						class="rounded-[var(--kit-radius-chip)] bg-[var(--kit-skill-chip-bg)] px-2 py-1 text-[length:var(--kit-text-label)] font-medium text-[var(--kit-skill-chip-fg)]"
						@click="insertReview"
					>
						review
					</button>
					<span class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">
						点击等价于 Suggestion 选中后插入
					</span>
				</div>
				<div class="mt-3">
					<Sender
						ref="senderRef"
						:skills="skills"
						@submit="(text) => (lastSent = text)"
					>
						<template #footer>
							<span class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
								chip 是原子内联块：退格一次整体删除（含尾随空格）。
							</span>
						</template>
					</Sender>
				</div>
				<p data-testid="sender-last" class="mt-3 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					最近发送：{{ lastSent }}
				</p>
			</section>

			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">7. 对话核心（Chat）</h2>
				<p class="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					消息列表 + 回合锚点栏 + 输入框 + 技能候选；发送后在本地追加一轮回显。
				</p>
				<div
					class="mt-4 h-[540px] overflow-hidden rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-bg)]"
				>
					<Chat
						:messages="chatMessages"
						variant="workspace"
						:skills="skills"
						anchor-rail
						scroll-key="demo"
						@send="onChatSend"
					>
						<template #empty>
							<EmptyState title="开始一段对话" hint="输入 / 选择技能，或直接发送消息。" />
						</template>
					</Chat>
				</div>
			</section>

			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">8. 工具审批</h2>
				<p class="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					多个待审批横向翻页；允许与拒绝都是一步直提，提交后状态由服务端再次校验。
				</p>
				<p data-testid="approval-note" class="mt-3 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
					最近操作：{{ approvalNote }}
				</p>
				<ToolApprovalGroup :approvals="approvals" :on-decision="onDecision" :on-refresh="onRefreshApproval" />
			</section>

			<section class="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-6">
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">9. 状态组件</h2>
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<EmptyState title="没有会话" hint="发起一次对话后会出现在这里。" />
					<ErrorState message="无法读取服务配置" :on-retry="() => (lastAction = '重试配置')" />
				</div>
			</section>
		</main>

		<ConfirmDialog
			v-if="confirmOpen"
			title="删除会话"
			body="删除后不可恢复。"
			confirm-label="删除"
			@confirm="
				confirmOpen = false;
				lastAction = '已确认删除';
			"
			@cancel="confirmOpen = false"
		/>
	</div>
</template>
