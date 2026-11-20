# apps/server — Hono 服务端

适用于本目录。先读[根规则](../../AGENTS.md)、[架构](../../docs/architecture.md)、
[接口](../../docs/interfaces.md)与[协议](../../docs/protocol.md)。

## 职责与入口

| 目录 | 职责 |
| --- | --- |
| `src/routes/` | Hono 路由、共享 Schema、OpenAPI 与 HTTP 边界 |
| `src/services/` | 身份、业务编排、计划确认、共享流、批次与恢复 |
| `src/gateway/` | SDK / Mock 适配、Provider 分页、规范化与安全投影 |
| `src/store/` | SQLite / MySQL / PostgreSQL 连接与迁移、目录/索引、数值快照和临时执行账本 |
| `tests/` / `tests/live/` | 服务端与 Provider 合同 / 显式启用的 Cloud 验证 |

## 不变量

1. 路由和业务服务经 gateway 访问 Provider，不直接 import 上游 SDK 或复制其事件转换。
   现存 REST 窄入口的原因与范围以架构、接口及研究证据为准，不自行扩展旁路。
2. Provider 凭据只在服务端解析并显式传入 SDK；Vault 明文仅存所属批次的内存。
   不写全局环境变量、YAML、SDK state、回执、响应、日志或错误。
   所有远端详情使用白名单投影及相应脱敏合同，不能整包透传 attributes/metadata。
3. Provider 是事件与消息正文的事实源。Kit 数据库仅保存被允许的目录、身份哈希、
   归属/附件索引、用量数值、删除阶段、Operation、审计及 ADR-0017 的临时账本。
   不能借缓存、审计或恢复名义持久化事件正文和凭据。
4. 数据面按 `subjectId`，调试按 `subject + purpose` 校验归属；越权不泄露资源存在性。
   成员登录为默认模式，匿名必须显式配置；上传、挂载及下载同样校验归属。
5. `auditor` 的写入拒绝由统一管理中间件强制。审计主体来自认证上下文，
   仅记录现行白名单动作；响应、审计和指标不能泄露令牌、正文或高基数身份。
6. 高风险动作先计划、后显式确认，令牌绑定主体/动作/目标且只能消费一次。
   缺字段、畸形、伪造、过期、冲突和重放分别遵循共享 Schema 与接口错误合同，
   不把所有拒绝写成同一 HTTP 状态，不自动补确认或重发未知写入。
7. Session 共享 pump 先连接并合并分页历史/实时事件，再开放 ready；
   发送和审批等待就绪。传输 cursor 与业务 event_id 分离，累计快照只替换不追加。
   浏览器取消订阅不等于 interrupt；无订阅的 running 回合继续有界跟踪，
   非 running 或终止后释放，具体生命周期见协议。
8. 审批以当前 Provider 的 batch/call/线程身份为准，同目标串行去重；
   结果不明先查状态，不能自动重复 POST。普通 Turn 结束或等待审批不伪造流关闭。
9. 成员会话删除先隔离并发写入、确认执行停止、保存最新累计用量，再发 DELETE。
   中断、采集、落库或删除结果未知时保留持久阶段与写保护，重启不得解除或重放。
10. 新资源仅走 YAML 批次公开对象合同；目录 Project、Build、源码版本和目录恢复已退役。
    Plan 绑定 revision、声明/上传哈希及 SDK 计划；执行前在批次互斥下复核。
    完整成功证明、完整绑定和最小回执顺序持久化后才清理；部分成功/未知禁止重发，
    清理失败只收尾，重启不自动续发。File/Skill 使用受控上传暂存。
11. 模版仅长期保存引用、显式版本、展示配置及不可变版本快照。
    更新校验 `base_version` 并事务同步关联 Catalog；远端失效不能回退最新版本。
    上下架和模版删除保留确认闸门，不能改变既有 Session 或删除远端引用资源。
12. 上传路由不得使用 OpenAPI 无法渲染的文件 Schema；共享 DTO 取自 SDK `/protocol`。
    新增 op、Schema 或路由时同步登记和生成，不手改生成物。
13. 数据库驱动归 `src/store/`，由 `server-database-drivers-in-store` 检查。业务 Store 共用
    异步读写和事务接口，跨 Store 事务须共用连接。三库共用结构定义和迁移顺序，各库分别记账。
    [迁移清单](src/store/schema/manifest.json) 决定完整顺序。已交付的迁移保留原 ID、内容和顺序，
    新变更由生成命令追加到清单。

## 修改步骤

1. 在 `docs/interfaces.md` 核对或登记 op，确认身份、Schema、错误与恢复语义。
2. 路由只负责边界；服务组织业务，gateway 处理 Provider 合同，store 处理事务与迁移。
3. 改后端接口运行 `pnpm gen:openapi`，检查服务端 spec 与 SDK 生成类型。
4. 在拥有风险的层补最少合同测试；Provider HTTP/SSE 映射放 gateway fixture，
   上层不重复映射。确认闸门必须验证无有效 token 拒绝与有效 token 通过。
5. 改流或恢复时同步协议，覆盖静默断流、历史/实时交叉、游标续传或未知结果路径；
   live 结果不能由 Mock 代替。
6. 改表先编辑 [共享表结构](src/store/schema/definition.sql)。改名、改类型、删除和回填按同一
   版本补充显式步骤。以成员表新增备注为例，从仓库根目录运行下列命令。审核生成的三库迁移，
   提交共享定义、更新后的迁移清单、版本快照和显式步骤。

   ```bash
   pnpm --filter @openagentpack/kit-server db:generate --name add_member_remark
   pnpm --filter @openagentpack/kit-server db:check
   ```

   服务端各开发和构建入口先运行 `db:render`，按已登记的版本写入 Git 忽略的 `schema/generated/`。

## 验收

```bash
pnpm --filter @openagentpack/kit-server db:check
pnpm --filter @openagentpack/kit-server typecheck
pnpm --filter @openagentpack/kit-server test
pnpm check:architecture
pnpm check:docs
```

接口变更检查 OpenAPI 漂移；Cloud、录制 fixture 和清理遵循验收文档，
`tests/live/record.ts` 仅作只读录制。文档文字变更按根规则选择验证。
