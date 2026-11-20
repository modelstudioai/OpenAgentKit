# 测试与验收

本文说明仓库的测试分层、常用命令和真实 Cloud 验证规则。具体功能的验收用例随测试代码维护；
逐次验证证据放在 PR 描述或 CI artifact 中，不提交到仓库。

## 分层与职责

| 层 | 命令 | 覆盖 |
| --- | --- | --- |
| 仓库脚本 | `pnpm test:scripts` | 首次配置、既有 `.env` 不变、取消 / 并发保护、依赖构建与服务启动顺序、组件复制 |
| SDK 数据层 | `pnpm --filter @openagentkit/sdk test` | SSE 帧编解码、快照归并、`event_id` 去重、重连与 `after` 续传、工具审批、确认令牌 |
| chat-ui | `pnpm --filter @openagentpack/kit-chat-ui test` | 消息渲染、执行过程、附件与快捷指令、审批交互、空态与禁用态 |
| server | `pnpm --filter @openagentpack/kit-server test` | 路由与权限、身份归属、确认闸门、事件不落库、OpenAPI 一致性 |
| gateway 合同 | 同上（`tests/fixtures/`） | Provider HTTP/SSE 映射；Mock 与 SdkGateway 跑同一套契约 |
| Console | `pnpm --filter console test` | 管理客户端、导航、草稿所有权、资源表单与恢复 |
| Web | `pnpm --filter web test` | 配置、身份隔离、宿主适配及页面纯逻辑 |
| 文档站 | `pnpm --filter storybook test` | 接口文档与 Skill 链接；页面内容/预览另由静态构建及浏览器验证 |
| 开发 Skill | `pnpm check:skills` / `pnpm typecheck:skills` / `pnpm test:skills` | 公开 API、生成漂移、示例编译、离线包及浏览器边界 |
| web / console E2E | `pnpm e2e` | 对话、重连、归档/删除、附件、管理端 plan → 确认 → 执行 |

> Provider HTTP/SSE 合同由 gateway 层 fixture 保护；上层 hooks 测试不重复断言同一份映射。

## 本地门禁

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:architecture
pnpm check:docs
pnpm check:no-inner-deps
pnpm gate          # 以上全部
pnpm verify:push   # pre-push hook 子集
```

文档站由 GitHub Actions 检查、构建并发布到 GitHub Pages，配置见[文档站部署说明](../apps/storybook/README.md#github-pages-部署)。
完整验收在本地执行 `pnpm gate` 与 `pnpm e2e`，结果记录在 PR 描述中。
本地 hook 可被 `--no-verify` 绕过。

### 环境与文档站准备

Node 与 pnpm 分别遵循根 `engines` 和 `packageManager`。检查实际 `core.hooksPath`，
不能把个人全局 hook 当作仓库检查；需要启用仓库 hook 时使用 `pnpm setup`。

干净安装后，文档站类型检查和链接测试依赖 `.source/server.ts`、本包 OpenAPI 输入及 Skill 下载准备。
缺失时执行已有生成入口，不手写空文件或修改测试规避：

```bash
pnpm --filter storybook exec fumadocs-mdx
pnpm --filter storybook prebuild
```

`prebuild` 同步服务端 OpenAPI、检查并准备 Skill 下载，以及构建 SDK / chat-ui 依赖；
`pnpm --filter storybook build` 生成静态 `out/` 和搜索索引。包、页数与版本以当前清单及产物为准，
不以旧 CI 子树、历史包名或固定页数作为验收条件。

Mock 端到端（首次选择 Mock；已有 `.env` 时先确认 `KIT_GATEWAY=mock`）：

```bash
pnpm start
```

Playwright：

```bash
pnpm e2e
```

## 测试归属与保真

- 新增测试先写清保护的用户流程、业务不变量、模块/Provider 合同或历史缺陷。
- 通过公开接口或可观察结果验证；删除依赖实现步骤、与其他层重复的测试。
- 负向断言先证明目标路径可达：权限测试显示资源确实存在；异步 UI 测试等待初始化与事件处理完成。
- 闸门测试必须覆盖「无 confirmation token 被拒」与「有 token 通过」两条路径。
- 去重与重连覆盖「历史回放 + 实时流」交叉到达（`event_id` 重复）与 `after` 游标续传。
- 静默断流与显式 `done` 是不同场景，不能用发送 `done` 的 mock 证明自然断流。

## 真实 Cloud（live）

- 使用仓库 `.env`，不输出、不修改、不提交凭据；日志与错误消息中的 key 必须脱敏。
- 默认不运行，只在任务明确需要且显式设置 `KIT_LIVE=1` 时执行；后续接入 CI 时由受保护变量启用。
- 资源使用唯一前缀 `kit-live-<yyyymmddHHMM>-`，并写 metadata `{ "kit": "live-validation" }`。
- 结束后删除临时 Session；Agent 按 Provider 当前正式删除/归档合同清理。
  Environment 因引用关系拒绝删除时按正式协议归档；采用归档时在交付记录说明原因。
- 验证证据写 PR 描述或 CI artifact，包含命令、结果和脱敏后的关键字段；不提交真实资源 ID。

```bash
KIT_LIVE=1 pnpm --filter @openagentpack/kit-server exec tsx tests/live/smoke.ts
```

## 文档与生成物

- `pnpm check:docs` 校验文档中的 `pnpm <script>` 存在、每个包有 `AGENTS.md`、
  `docs/interfaces.md` 的 ✅ 行与 `apps/server/openapi.json` 路径一致。
- `pnpm gen:openapi` 生成 OpenAPI 与 API 类型；`pnpm gen:skills` 生成 Skill 参考与示例。
- 构建产物、缓存与 `.scratch/` 不入库。

## 风险驱动验证

新增或修改测试前，明确它保护的用户流程、业务不变量、模块/Provider 合同、恢复路径或历史缺陷；
选择最少的代表性成功、拒绝、边界和失败场景。类型保证、简单透传和框架默认行为无需独立测试。

| 修改类型 | 最小验证与扩大条件 |
| --- | --- |
| 仅 AGENTS.md / 工程规范文字 | 检查路径、命令、权威归属、替代关系和冲突；运行 `pnpm check:docs`、`pnpm lint` 与 diff 检查。无运行时或站点内容变化时，无需重跑所有构建、浏览器与 Cloud |
| SDK / UI / 应用运行时代码 | 对应包类型检查与合同回归；公开 API、样式或交互变化再检查实际调用方、构建产物及相关 E2E |
| 接口 / Schema / Provider 合同 | 生成 OpenAPI 与 SDK 类型，校验接口表；在拥有映射的层覆盖代表性成功、拒绝及恢复场景 |
| Skill 源 / 生成器 / 公开示例 | 检查或重新生成产物，编译示例，选择生成、链接、打包或浏览器边界回归 |
| 架构、依赖配置或交付链路 | 检查依赖方向、工作区与任务图，按影响运行完整门禁或相应构建 |

表结构改动运行 `db:check`，核对共享定义、迁移清单和逐条保存的历史，并验证三库产物可生成。
直接运行下面的 Vitest 用例前，用 `db:render` 准备本地生成文件。服务端的 `test` 入口包含这一步。
迁移用例 `apps/server/tests/database-migrations.test.ts` 覆盖空库回放、带数据的历史升级、旧外部库
接续和 DDL 中途恢复。外部库用例用测试账号创建和清理独立的临时数据库。
存储改动使用 `apps/server/tests/database-backends.test.ts` 验证登录、模版事务、会话索引、
重复扣减、Logo 和资源发布。默认运行 SQLite。将 `KIT_TEST_MYSQL_URL` 和 `KIT_TEST_POSTGRES_URL`
分别指向专用 MySQL 8.4 和 PostgreSQL 测试库，可对同一流程运行三种后端。测试使用 Mock Provider，
会在指定数据库写入和保留测试记录。

```bash
pnpm --filter @openagentpack/kit-server db:check
pnpm --filter @openagentpack/kit-server db:render
pnpm --filter @openagentpack/kit-server exec vitest run tests/database-backends.test.ts tests/database-migrations.test.ts
```

生成物、lockfile 与构建缓存不计入手写文件规模；生产源码超过 800 行、测试或脚本超过 1000 行时，
按变化原因评估职责拆分，不机械切文件。规范维护不能通过删去有效合同来缩短入口文件。
记录真实执行的步骤和环境；取消、跳过或环境失败不计为通过，Mock / 离线结果不能替代 Cloud。
