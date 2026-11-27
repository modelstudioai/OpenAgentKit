# apps/server — NestJS 服务端

适用于本目录。先读[根规则](../../AGENTS.md)、[架构](../../docs/architecture.md)、
[接口](../../docs/interfaces.md)与[协议](../../docs/protocol.md)。

## 职责与入口

| 目录 | 职责 |
| --- | --- |
| `src/controller/` | `admin/` 管理端、`staff/` 员工端、`meta.ts` 公开端点 |
| `src/http/` | 共享请求管线、路由装饰器、SSE 传输与 OpenAPI 生成 |
| `src/service/` | `admin/` 管理端用例、`staff/` 员工端用例、`shared/` 共用的业务服务类和状态类 |
| `src/entity/` | `tables/` 下手写的 TypeORM 装饰器实体和三库映射 |
| `src/store/` | 三库连接、SQL 执行、实体查询、事务与迁移 |
| `src/gateway/` | `bailian/` 百炼适配、`mock/` 离线实现、`shared/` 共用的转换和声明适配 |
| `src/module/` | Nest 应用与 Controller 注册、配置、连接及依赖装配 |
| `src/utils/` | 注入令牌、密码与签名、UTC 日期、事件缓存、限流和指标 |
| `tests/` / `tests/live/` | 服务端与 Provider 合同 / 显式启用的 Cloud 验证 |

## 不变量

1. 管理端 `/api/admin/*` 和员工端 `/api/kit/*` 的 Controller 分目录注册。
   健康检查、公开配置和 Logo 读取由 `controller/meta.ts` 提供。
   Controller 按业务域注入所需的 Service，Service 以类的实例方法实现业务逻辑并经 Gateway 访问 Provider。
   同域 Controller 共享业务实例。Service 实例方法负责简单实体读写、Gateway 调用与多步业务编排。
   `service/` 文件的运行时导出均为类，会话订阅与发布批次的状态由各自的实例管理。
   单一用例的业务校验、计算和映射写在所属 Service 的实例方法中。多个业务域复用的规则由 `service/shared/` 中对应的 Service 提供。依赖装配与工厂位于模块层，Service 构造器初始化依赖和实例状态。
   上游 SDK 底层调用和事件转换归 Gateway。`server-bailian-no-mock` 与 `server-mock-no-bailian` 隔离两种实现。
   `server-no-concrete-provider-imports` 约束 Gateway 共享代码、公共合同和业务 Service 通过接口使用具体实现。
   `service/admin/resource-draft/uploads/` 管理上传、校验和素材哈希，`recovery/` 管理成功证明、回执及清理。
   素材访问从 `module/gateways.ts` 装配进发布适配器，发布结果未知时由批次服务核对恢复。
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
7. Session 共享上游订阅就绪后发 ready，实时游标仅记录实时变更。历史由独立接口分页；
   发送和审批等待上游连接与运行状态校验。传输 cursor 与业务 event_id 分离，累计快照只替换不追加。
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
13. 数据库驱动归 `src/store/`，由 `server-database-drivers-in-store` 检查。Nest 应用装配时
    为 Service 提供同一个 `StoreDatabase`，业务事务内的读写共用连接。
    Service 使用 `@Inject(StoreDatabase)` 取得实体读写接口，使用 `@Inject(类名)` 获取共用的 Service 实例，配置、Gateway 和事件缓冲按对应令牌注入。
    实体是三库当前结构的唯一来源，各库分别登记已覆盖的迁移。
    `server-typeorm-in-persistence` 允许 `service/`、`entity/` 和 `store/` 使用 TypeORM。每张业务表对应一个手写的
    `@Entity` 类，列装饰器声明与数据库列同名的属性。Store 在当前连接执行实体查询，TypeORM 的自动同步和迁移关闭。
    [迁移清单](src/store/schema/manifest.json) 决定完整顺序。已交付的迁移保留原 ID、内容和顺序，
    新变更由生成命令追加到清单。
14. Controller 调用 Service。Service 的实例方法承担业务校验、实体读写与事务。多个用例共用的能力放在 `service/shared/`。Provider 访问走 Service → Gateway。
    Controller 使用 `http/` 的传输组件，`module/` 将已注册的 Controller 清单传入 OpenAPI 生成器。
    `server-http-no-controller` 检查 HTTP 和 Controller 之间的依赖方向。
    两端的 Controller 与 Service 只引用本端及共享 Service，分别由 `server-admin-no-staff-service` 和
    `server-staff-no-admin-service` 检查。`server-shared-no-role-service` 约束共享 Service 独立于两端用例。
    `server-business-rules-in-services` 阻止生产代码重新依赖顶层 `src/domain/`。
    `server-http-no-infrastructure` 限制 HTTP 层直接访问基础设施。`server-service-persistence-api` 将 Service 的持久化依赖限制为实体表、StoreDatabase 和查询表达式，
    `server-core-no-http`、`server-persistence-no-service` 和
    `server-gateway-no-business`、`server-utils-no-business` 检查反向依赖。Nest 使用应用级实例管理订阅、确认和限流，
    批次服务由资源发布服务管理。关停先释放 HTTP 和流，再关闭数据库。

## 修改步骤

接入或切换数据库时，按 [kit-database](../../assets/skills/kit-database/SKILL.md) 核对现有配置和目标库。
启动后通过日志中的 `db=` 和 `/healthz` 确认后端与服务状态。需要核对迁移时，读取目标库的 `_kit_migrations`。

接入员工 OIDC 时，按 [kit-keycloak](../../assets/skills/kit-keycloak/SKILL.md) 配置 Realm、客户端与成员绑定，并验证实际登录。

1. 在 `docs/interfaces.md` 核对或登记 op，确认身份、Schema、错误与恢复语义。
2. 路由映射 HTTP 合同，Service 组织用例并通过实体读写数据库，Store 提供连接、事务接口与迁移，Gateway 处理 Provider 合同。
3. 改后端接口运行 `pnpm gen:openapi`，检查服务端 spec 与 SDK 生成类型。
4. 在拥有风险的层补最少合同测试；Provider HTTP/SSE 映射放 gateway fixture，
   上层不重复映射。确认闸门必须验证无有效 token 拒绝与有效 token 通过。
5. 改流或恢复时同步协议，覆盖静默断流、历史/实时交叉、游标续传或未知结果路径；
   live 结果不能由 Mock 代替。
6. 改表时编辑对应的[实体类](src/entity/tables/)，新增表时在实体清单中登记。改名、改类型、删除和回填按同一
   版本补充显式步骤。以成员表新增备注为例，从仓库根目录运行下列命令。审核生成的三库迁移，
   提交实体修改、更新后的迁移清单、生成的版本快照和需要的显式步骤。

   ```bash
   pnpm --filter @openagentpack/kit-server db:generate --name add_member_remark
   pnpm --filter @openagentpack/kit-server db:check
   ```

   服务端各开发和构建入口先运行 `db:render`，校验实体类并将迁移产物写入 Git 忽略的
   `schema/generated/`。`db:entities` 只读校验实体声明和派生的表结构。

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
