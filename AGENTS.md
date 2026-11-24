# OpenAgentKit Agent 规则

本文件适用于当前独立仓库的全部工作，供人类维护者和 coding agent 共同使用。
产品代码、配置、测试及验收依据均留在本仓库，不依赖父目录、全局 Skill 或个人环境。

## 先读什么

现行规则按以下顺序解决冲突；已标记退役、替代的 ADR 正文仅作历史背景。

1. [已接受的 ADR 及状态更新](docs/adr/README.md)：架构决策与已批准的例外。
2. [架构](docs/architecture.md)：进程、分层、依赖方向和 UI 边界。
3. [目录规则](docs/repository-layout.md)：源码、测试、生成物和 AGENTS.md 的归属。
4. [接口](docs/interfaces.md)：跨层合同与后端 op 对照表。
5. [协议](docs/protocol.md)：SSE、恢复、去重、错误与确认令牌。
6. [验收](docs/validation.md)：风险驱动验证、本地门禁和真实 Cloud 规则。
7. 适用目录的 `AGENTS.md`：局部不变量、修改步骤和验证入口；不能覆盖以上规则。

代码与现行规范冲突时，先核对实际合同及历史替代关系，再同步拥有该规则的权威文档；
不能仅因旧实现存在就恢复旧架构。历史控制台及早期原型不作为复制代码的来源。

## 当前目录与开发入口

| 目录 | 职责 |
| --- | --- |
| `apps/server` | Hono 服务端、Provider gateway、身份、确认与本地索引 |
| `apps/web` | Web / H5 体验页，静态 CSR |
| `apps/console` | 管理端，控制面客户端及业务 hooks |
| `apps/storybook` | Fumadocs 文档站、真实组件预览与静态下载 |
| `packages/sdk` | 按功能组织的数据 SDK、协议、Provider 和可选 React hooks |
| `packages/chat-ui` | 可 copy-in 的 Chat 产品组件、主题与 registry |
| `packages/eval` | Node 侧 Skill 评测库及命令入口 |
| `scripts/skills` / `assets/skills` | 中文开发 Skill 的人工源及生成物 |
| `scripts/kit` | 组件复制与组件目录脚本 |
| `docs` / `.scratch` | 权威文档与研究 / 被忽略的临时探针、日志、截图 |

- Node.js 要求以根 `engines` 为准（当前 ≥24）；pnpm 版本以根 `packageManager` 为准。
- 开始修改前检查分支、远端、暂存区和工作区，保留其他并行工作的改动。
- 完整 SDK 公开入口以 `packages/sdk/package.json` 为准；目录映射见目录规则。
- 工作区只包含 `apps/*` 与 `packages/*`；目录与命令是否可用以当前清单为准，
  不按历史 ADR 的旧名称恢复已退役的包、原生壳、项目生成器或目录 Project API。
- 配置 Kit Server 的 SQLite、MySQL 或 PostgreSQL 时，使用仓库内的 [kit-database](assets/skills/kit-database/SKILL.md)。

## 执行红线

遇到以下需要时停止相关改动并记录阻塞，不能自行放宽边界：

- runtime import 上游 `@openagentpack/sdk/internal/*`，或从 Kit SDK 私有源码/构建分片跨包导入。
  浏览器只允许上游 SDK 的 type-only 主入口及浏览器安全的 `session-events` 子路径。
- 在 SDK 数据入口或 `src/protocol` 引入 React、DOM 或 Node-only API。
  React 仅允许位于六个功能模块的 `hooks/`、通用 `src/hooks/` 与
  `src/providers/kit/react/`（ADR-0026）。
- 另造事件模型，或把 Provider 事件、消息正文写入 Kit 数据库。共享事件使用上游 `SessionEvent`；
  临时 YAML、SDK state 与成功证明的存储例外见 ADR-0017/0018。
- 将 Provider key、Vault credential 下发到浏览器，写入仓库、日志、错误或持久化声明。
  Provider 配置显式传入 SDK，运行链路不得改写进程全局环境变量。
- 绕过 `plan → 显式确认` 执行高风险远端操作，代填 `--yes` 或 `confirmed: true`，
  或在部分成功、结果未知时自动重发写请求。
- 引入内网包、内网域名、私有网关或固定密钥注入；在 `apps/console` 之外引入 antd。
- 前端业务请求假设与 server 同源；后端地址须经运行时配置解析。
- 尚无第二个 Provider 的真实数据面合同就为它预建行为抽象。

## UI 与交互

1. 体验页和所有端的对话链路复用 `@openagentpack/kit-chat-ui`。缺少 Primitive 时按
   Radix + Tailwind v4 + CVA 补齐，并说明既有组件为何不够；新增组件必须有真实调用方。
   Console 的管理控件优先 antd v6，按页面渐进迁移，具体边界见 ADR-0015。
2. Chat UI 与体验页消费 `theme.css` 的冻结颜色、尺寸和动效 token，不在业务组件新增设计常量、
   内联样式表或 keyframes。Console 的 antd token、全局适配及既有 Less 样式归口见架构文档；
   文档站视觉层归 `apps/storybook/app/globals.css`。
3. 接口规定有计划合同的发布、上下架及会话归档/删除，必须保留服务端计划与一次性令牌。
   Chat UI / Web 使用 AlertDialog；Console 可使用受管焦点、模态和显式确认的 antd Modal。
   资源发布展示 SDK 差异，限额调整展示配置差异；模版编辑/历史应用确认生效影响并校验
   `base_version`，不能将其写成 SDK apply 或新增计划接口。模版上下架及删除的单次确认展示
   以接口和协议文档为准，不推广到其他动作。
4. 展示组件不直接请求业务接口。共享调用流程使用 SDK 数据模块及各功能 `/hooks`；
   Console 管理业务位于 `apps/console/src/lib/admin/`，不迁回 SDK。
5. 动态消息及分片使用 SDK 稳定 ID；禁止用数组下标作为累计快照列表的 key。
   `noArrayIndexKey` 的静态示例兼容设置不豁免动态数据。
6. 弹层、折叠、入场及悬停消费冻结动效 token 和 `.kit-collapse`，
   在 `prefers-reduced-motion` 下降级；不得嵌套交互元素，移动端保留等效操作入口。

## 修改与文档维护

- 项目文档使用中文；标识符、命令、Schema 及必要上游原文保留原语言，对外发布时补英文版。
  开发 Skill 的入口、参考、元数据和示例文案使用中文，保留 Skill ID 与 API 标识符（见 ADR-0027 状态更新）。
- 根文件保留全仓规则，局部 AGENTS.md 保留职责、不变量、修改步骤与验收入口。
  产品合同、页面细节和长期证据分别回到现有权威文档或 `docs/research/`，
  不创建平行规范或堆积逐次工作记录。
- 新增后端 op 同步 `docs/interfaces.md`；改协议同步 `docs/protocol.md`；
  改分层同步 `docs/architecture.md` 与 `.dependency-cruiser.cjs`；
  难以撤销的决策写 ADR，历史记录通过状态更新说明替代关系。
- OpenAPI、SDK API 类型、Skill 产物和嵌入示例通过各自生成命令更新，不手改生成区。
- 验收证据放 PR 描述或交付记录，临时文件放 `.scratch/`；凭据和数据库不提交。

## 风险驱动验证

先明确修改保护的用户流程、合同、业务不变量或恢复路径，再选择最少的代表性用例。
不为类型保证、简单透传、框架默认行为增加重复测试；详细测试保真要求见验收文档。
修改前后检查文件职责：生产源码超过 800 行，测试或脚本超过 1000 行时按变化原因评估拆分，
不按行数机械切分；生成物不计入。

文档改动校验命令、路径和规则语义；运行时代码改动执行相应包与调用方回归。
Mock / 离线通过不代表真实 Cloud 已验收。Live 必须显式启用，资源使用唯一前缀并按
验收文档清理，不输出、修改或提交本地凭据。

## 常用命令与提交

```bash
pnpm install
pnpm setup              # 可选：启用仓库 .githooks
pnpm start              # 首次引导配置并启动 server / web / console；已有 .env 原样复用
pnpm dev                # server :8787 / web :5173 / console :5174 / storybook :3000
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:architecture
pnpm check:docs
pnpm check:no-inner-deps
pnpm gen:openapi
pnpm gen:skills
pnpm gate               # 完整本地门禁
pnpm verify:push        # 推送验证子集
```

命令的精确定义以根 `package.json` 为准。`check:docs` 检查命令、包级入口、接口路径和
Skill 漂移，不能代替规范语义审查。仅文档调整的验证选择见验收文档。

仓库 `.githooks/` 提供暂存区 lint、提交格式和推送验证；只有 `core.hooksPath` 指向它时才生效，
不要假定个人全局 hook 已执行仓库门禁。Hook 可被 `--no-verify` 绕过，是便利而非强制。
文档站通过 GitHub Actions 发布到 GitHub Pages。完整验收使用 `pnpm gate`。

提交信息使用简体中文 Conventional Commits：`<type>(scope): <description>`，每行不超过
100 字符。scope 使用 `sdk`、`chat-ui`、`eval`、`server`、`web`、`console`、
`storybook`、`docs`、`skills` 或 `repo`。

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
