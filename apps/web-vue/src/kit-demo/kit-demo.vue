<script setup lang="ts">
import {
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
	Tooltip,
} from "@openagentpack/kit-chat-ui-vue";
import { ref } from "vue";

const confirmOpen = ref(false);
const lastAction = ref("尚未操作");

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
				<h2 class="text-[length:var(--kit-text-heading)] font-semibold">6. 状态组件</h2>
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
