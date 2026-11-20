# ADR-0003：catalog 用 SQLite（`node:sqlite`）+ store 接口抽象

状态更新（2026-11-19）。三库共用表结构定义、历史版本 ID 和执行顺序。新库从 `001_init`
开始回放全部历史。SQLite 继续使用原有迁移。MySQL 和 PostgreSQL 用方言生成的 DDL 及显式
数据步骤重放历史。已初始化的外部库通过旧版本标识和结构校验接续。
原有 36 条迁移各自保存在 `schema/history/`，和 `033` 起的新版本共用
`schema/manifest.json` 定义顺序。
新结构变更由 `db:generate` 登记版本和快照。构建根据迁移源重新生成三库产物并随服务打包。
服务启动时执行待处理版本。
维护步骤见[服务端 README](../../apps/server/README.md#维护表结构)。

历史状态（2026-11-18，由上方状态更新替代）。SQLite 是本地默认后端。Kit Server 在 `src/store/` 提供
共享异步数据库接口和基于配置的连接工厂，支持 SQLite、MySQL 8.4 InnoDB 和 PostgreSQL。
各后端分别维护结构迁移。MySQL 和 PostgreSQL 从现行结构初始化，SQLite 继续执行既有历史迁移。
共享 Store 持有业务 SQL 和事务，驱动适配放在 Store 内。事务中的跨 Store 调用共用连接，
进程内写入沿用单实例顺序。配置选项见[服务端 README](../../apps/server/README.md)。

## 背景

管理端需要持久化 Catalog Entry、Session 本地索引、Operation 与审计日志。原计划用
drizzle-orm + better-sqlite3。实测发现：

- drizzle-orm 0.45.4 **没有 `node:sqlite` driver**（只有 better-sqlite3 / bun-sqlite /
  op-sqlite / expo-sqlite / libsql / durable-sqlite / sqlite-proxy）；
- `better-sqlite3` 是原生模块，内网安装需下载 prebuilt 二进制，网络受限环境失败率高；
- 本机 Node 为 v24，内置 `node:sqlite`（`DatabaseSync`）可用，零原生依赖。

## 决策

1. 使用 Node 内置 `node:sqlite`（`DatabaseSync`）作为默认存储引擎；**引擎基线提到
   Node ≥ 24（LTS）**，`package.json` 的 `engines` 与 `.nvmrc` 同步。
2. 迁移用**幂等 SQL 文件 + 版本表**（`store/migrations/*.sql` + `_kit_migrations`），
   不引入 drizzle-kit 生成链路。
3. 所有访问经 `CatalogStore` / `OperationStore` / `SessionIndexStore` 接口；`node:sqlite`
   只是其中一个实现，Postgres/drizzle 实现可在不改上层的前提下加入。
4. **事件正文不落库**；SQLite 只承载目录与运营索引（持久化边界见
   [`docs/architecture.md`](../architecture.md) 的「Server 内部结构」）。

## 理由

- 零原生依赖 = 内网可装、CI 可跑、开源后用户 `pnpm install` 不炸，这对一个要对外分发的
  kit 是硬需求。
- 手写迁移在表数量少（< 10）时比引入 ORM + 生成器更可控，也更符合「代码即文档」。
- 接口抽象保留了升级到 Postgres（多副本部署）的路径。

## 后果

- 偏离原计划的「drizzle + SQLite」，README/计划文档需同步（本 ADR 即记录）。
- Node 基线从 22 提到 24；上游 `@openagentpack/sdk` 要求 `node>=18.17`，兼容。
- `node:sqlite` 在 Node 24 仍标记 experimental，可能打印告警；用 `--no-warnings` 或在
  启动日志中说明，不改行为。
- 失去 drizzle 的类型化 query builder；DAO 层需要自己保证类型安全（用 zod 校验行数据）。
- **bundler 坑**：esbuild/tsup 会把静态 `import … from "node:sqlite"` 改写为 `"sqlite"`（丢 `node:`
  前缀），运行时报 `Cannot find package 'sqlite'`。`apps/server/src/store/db.ts` 用变量间接的
  动态 `import(SQLITE_SPEC)` 绕过，并留注释；改存储层时不要改回静态导入。

## 备选方案

- `better-sqlite3` + drizzle：类型体验最好，但原生依赖在内网与开源用户侧都是风险。
- 纯文件（YAML/JSON）目录索引：可 Git review，但并发写入、搜索、排序、审计能力不足。
- Postgres 直接上：本地开发与开源试用门槛高（需先起 DB）。
