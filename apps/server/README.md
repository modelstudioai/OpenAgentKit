# apps/server — Kit Server

OpenAgentKit 服务端使用 NestJS 12.6.0 与 Express Adapter，向体验页提供数据面 API，
向管理端提供控制面 API。运行时使用 Node.js 24.11.0 或更新版本，支持内置 SQLite、外部 MySQL 和 PostgreSQL。

本文件面向人类读者；修改代码前请先读 [AGENTS.md](./AGENTS.md) 中的不变量和闸门。

## 它提供什么

| 面 | 前缀 | 主要内容 |
| --- | --- | --- |
| 数据面 | `/api/kit/*` | 成员登录、会话、消息与 SSE、工具审批、文件上传/下载、会话目录、用量与限额 |
| 控制面 | `/api/admin/*` | 模版与资源、YAML 资源批次、计划与确认执行、Operation、审计、成员与用量 |
| 公开配置 | `/api/config`、`/healthz` | 前端启动时读取 `apiBaseUrl` 与能力开关；健康检查 |

几个关键设计：

- **事件不落库**：Provider 是 Session、Event 与消息正文的唯一权威。Kit 数据库保存目录、
  身份、索引和运营数据。
- **Provider 走 Gateway**：路由不直接调用上游 SDK，`SdkGateway` 与 `MockGateway` 隔离
  Provider 变化，没有凭据时可用 mock 跑完整链路。
- **高风险动作两段式**：apply / destroy / publish / 上下架 / 删除会话先返回 plan 与确认
  令牌，缺令牌一律 `428`，服务端不代替用户确认。
- **身份与归属**：支持 OIDC 与成员登录，数据面按 `subjectId` 过滤；管理端区分 `admin` 与只读
  `auditor`。

## 快速开始

在 macOS 或 Linux 上，从仓库根目录运行下面两条命令即可启动 Server 和本地 Keycloak。

```bash
pnpm install
pnpm dev server
```

需要生成随机 Kit 管理员令牌或接入真实百炼时，可以用 `pnpm start server` 引导创建根 `.env`。
已有 `.env` 会原样复用。`pnpm start` 同时启动 Server、体验页与管理端。

只跑已构建的服务端：

```bash
pnpm --filter @openagentpack/kit-server build
node apps/server/dist/bin.js
```

`pnpm dev` 会从仓库根 `.env` 读取配置；单独用 `pnpm --filter ... dev` 时也会加载根 `.env`。

嵌入其他 Node 进程时，可从 `@openagentpack/kit-server` 或其 `/app` 子入口导入
`createApp(config)`，等待应用初始化后由宿主调用 `app.listen()` 和 `app.close()`。
独立 CLI 收到 SIGINT 或 SIGTERM 时，依次停止 HTTP 与流连接、清理会话订阅、关闭数据库。
需要回滚框架时，使用上一版 Hono 发布包和当前数据库。

## 常用配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | HTTP 端口 |
| `ADMIN_TOKEN` | 空 | 管理端 bearer token；本地示例为 `change-me`，生产必须替换 |
| `KIT_ADMIN_TOKENS` | 空 | 追加 `token:admin` / `token:auditor`，逗号分隔 |
| `BAILIAN_API_KEY` | 空 | 百炼凭据，仅存在于服务端 |
| `BAILIAN_BASE_URL` / `BAILIAN_WORKSPACE_ID` | 空 | 二选一，用于定位 workspace |
| `KIT_GATEWAY` | `auto` | `auto` 有凭据走 SDK、否则 mock；也可显式 `mock` / `sdk` |
| `KIT_AUTH_MODE` | 开发入口 `oidc`，独立服务 `member` | macOS / Linux 开发时可显式选 `member` 或 `anonymous` |
| `KIT_KEYCLOAK_ENABLED` | `true` | 设为 `false` 时关闭本地 Keycloak 联动启动与 OIDC 接入，`oidc` 回到 `member` 登录 |
| `KIT_OIDC_PASSWORD_LOGIN` | `false` | 在 `oidc` 模式下设为 `true`，体验页同时提供 Kit 用户名密码和企业登录 |
| `KIT_OIDC_ISSUER` | 空 | Keycloak Realm issuer，形如 `https://sso.example.com/realms/kit` |
| `KIT_OIDC_CLIENT_ID` | 空 | Web 的公开 OIDC 客户端 ID |
| `KIT_OIDC_AUDIENCE` | 空 | Kit API 的 access token audience，须与 Web 客户端 ID 不同 |
| `KIT_KEYCLOAK_USERS_URL` | 按 issuer 生成 | Console 创建用户页使用的 Keycloak 用户管理页完整链接。可覆盖独立管理域名及路径 |
| `KIT_KEYCLOAK_HOME` | 按需下载官方发行包 | 可指定已解压的 Keycloak 目录，相对路径以仓库根为基准 |
| `KIT_KEYCLOAK_JAVA_HOME` | 优先复用兼容 Java | 可指定 Java 路径。`JAVA_HOME` 与 `PATH` 均无兼容 Java 时下载本地 Temurin 21 |
| `KIT_KEYCLOAK_ADMIN_FILE` | `.scratch/keycloak-bootstrap-admin.json` | 本地管理员 JSON，字段为 `username` 与 `password`。已有本地实例可指向现有管理员文件 |
| `KIT_DATA_DIR` | `.data` | 本地数据目录，默认 SQLite 文件位于此处 |
| `KIT_DB_DRIVER` | `sqlite` | 可选 `sqlite`、`mysql` 或 `postgres`（别名 `pg`） |
| `KIT_DATABASE_URL` | 空 | 使用 MySQL 或 PostgreSQL 时填写所选数据库的连接地址 |
| `KIT_CORS_ORIGINS` | 本地开发来源 | 跨域白名单，支持 `http://127.0.0.1:*` loopback 通配 |
| `KIT_EVAL_WORKSPACES` | 空 | 管理端评测浏览的 workspace 根目录，逗号分隔 |

完整配置与限制参数见 `src/config.ts` 与根 `.env.example`。凭据不会下发浏览器，也不会写进日志。

### 接入已有 Keycloak

Kit 和员工浏览器需要能访问同一个 Realm issuer。本地自动配置见[开发时联动启动](#开发时联动启动)。
如需单独启动开发实例，可用官方镜像。先在当前 shell 导出临时管理员密码 `KC_BOOTSTRAP_ADMIN_PASSWORD`，然后运行下面的命令。

```bash
docker run --rm --name kit-keycloak \
  -p 127.0.0.1:8080:8080 \
  -v kit-keycloak-dev:/opt/keycloak/data \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD \
  quay.io/keycloak/keycloak:26.8.2 start-dev
```

开发容器使用命名卷保留 Realm 与用户。生产使用固定版本镜像、`start`、独立数据库及 HTTPS
issuer。部署说明见 [Keycloak Docker 快速开始](https://www.keycloak.org/getting-started/getting-started-docker)
和 [生产配置](https://www.keycloak.org/server/configuration-production)。

1. 创建 `kit` Realm 和 `kit-web` OpenID Connect 客户端。关闭 Client authentication，
   启用 Standard flow 和 PKCE S256，关闭 Direct access grants 与 Implicit flow。
2. 客户端的 Valid redirect URIs 填写体验页的准确地址，含路径，省略查询和片段，本地默认
   `http://127.0.0.1:5173/`。Web Origins 填写同一体验页的源（如
   `http://127.0.0.1:5173`），同时在 Kit 的 `KIT_CORS_ORIGINS` 放行部署的 Web 和
   Console 源。Keycloak 默认用 RS256，使用包含 `sub`、`jti` 和 `azp` 的常规 JWT access token。
3. 为客户端添加 Audience mapper。将 Included Custom Audience 设置为 `kit-api`，
   开启 Add to access token，关闭 Add to ID token。
4. 在 Kit 配置中加入这三个变量并重启，保持现有登录模式完成预绑定：

   ```dotenv
   KIT_OIDC_ISSUER=http://127.0.0.1:8080/realms/kit
   KIT_OIDC_CLIENT_ID=kit-web
   KIT_OIDC_AUDIENCE=kit-api
   ```

   issuer 须与 Keycloak 的 discovery 文档和令牌 `iss` 精确一致。HTTP 仅支持回环地址。
5. 在 Kit Console 的「创建用户」中填写 Keycloak Users 页中的用户 ID（默认 `sub`），
   一次提交即可创建成员并绑定。已有成员可在成员列表选择「企业绑定」。绑定完成后设置 `KIT_AUTH_MODE=oidc` 并重启 Kit，
   体验页即可使用「企业登录」。换绑后需使用绑定完成后签发的令牌。

创建用户页的 Keycloak 链接默认沿用 `KIT_OIDC_ISSUER` 的域名、端口和路径前缀，打开对应 Realm 的用户管理页。
如果 Keycloak 配置了独立管理域名或管理入口，在 Kit Server 设置 `KIT_KEYCLOAK_USERS_URL` 指向完整用户管理页，例如
`"https://sso-admin.example.com/admin/master/console/#/kit/users"`。在 `.env` 中用引号保留 `#` 后的路由。

如需同时提供 Kit 成员密码和企业登录，在 `.env` 设置 `KIT_OIDC_PASSWORD_LOGIN=true` 并重启 Server。
成员密码由 Kit Console 创建成员时设置，企业登录沿用 Keycloak 用户与成员绑定。

员工退出只结束本次 Kit 登录，Keycloak SSO 会话继续有效。接入钉钉或飞书时，在 Keycloak
配置上游身份代理并将上游账号关联到已绑定的 Realm 用户，Kit 侧继续校验同一 issuer 和 subject。

### 开发时联动启动

macOS / Linux 的开发入口在未配置认证模式和 issuer 时默认启用本地 OIDC。
Keycloak 监听 `127.0.0.1:8180`，自动创建缺失的 `kit` Realm 和 `kit-web` 客户端。
客户端使用 PKCE S256 与 `kit-api` audience。Web 与本地 Keycloak 共用 `KIT_WEB_DEV_PORT`，
React 体验页默认使用 5173，Vue 体验页使用 5175。两端均登记 localhost 与 127.0.0.1 的精确回跳地址。端口被占用时 Web 启动会报错，
可在根 `.env` 或启动命令中指定其他端口。首次启动会登记对应地址，后续启动也会补齐已有本地客户端
的回跳地址和 Web Origin。只配置 `KIT_AUTH_MODE=oidc` 也会采用这些默认值。
设置 `KIT_KEYCLOAK_ENABLED=false` 后，启动器直接启动 Kit Server，`oidc` 模式使用 Kit 成员登录。

首次运行用 `curl` 从 GitHub 下载固定版本的 Keycloak（约 166 MiB），通过 SHA-256 校验后用
`tar` 解压。已有 Java 17、21 或 25 会被复用。macOS 和使用 glibc 的 Linux 在 x64 / arm64 上
没有兼容 Java 时会下载 Temurin 21。
发行包、下载的 Java 和 Keycloak 数据保存在 Git 忽略的 `.scratch/keycloak/`。
本地管理员凭据生成在 `.scratch/keycloak-bootstrap-admin.json`，权限为 `0600`。
重启时复用这些文件以及已有的 Realm 和客户端。

已有本地实例可在根 `.env` 指定包含 `bin/kc.sh` 的 `KIT_KEYCLOAK_HOME`、回环 issuer 和
`KIT_KEYCLOAK_ADMIN_FILE`，以便启动时查询和补齐资源。设置 `KIT_AUTH_MODE=member` 或
`anonymous` 即可使用对应的开发登录模式。接入独立部署的 Keycloak 时，填写完整 OIDC 连接参数。

Realm 就绪后以 `tsx watch` 启动 Kit Server。先在 Keycloak 创建员工账号，再在 Kit Console
创建或编辑企业绑定。源码热重启只重启 Kit，退出开发命令会结束本次启动的 Keycloak 进程。

### 选择数据库

也可以用 `$kit-database` 让 coding agent 按项目配置接入数据库并核对启动结果。[数据库接入 Skill](../../assets/skills/kit-database/SKILL.md)

默认启动使用 `KIT_DATA_DIR/kit.sqlite`。如需外部数据库，先创建 Kit 专用库，并授予连接账户
在该库中建表和读写的权限。在根 `.env` 或服务端进程环境中设置以下一组变量，重启后会在所选库中初始化表结构。

MySQL 8.4 使用 InnoDB。

```dotenv
KIT_DB_DRIVER=mysql
KIT_DATABASE_URL=mysql://kit_user:password@127.0.0.1:3306/kit
```

PostgreSQL 默认连接 5432 端口。

```dotenv
KIT_DB_DRIVER=postgres
KIT_DATABASE_URL=postgresql://kit_user:password@127.0.0.1:5432/kit
```

用户名和密码含 URL 保留字符时需要百分号编码。两种外部连接均可追加 `?ssl=true` 开启 TLS 并校验服务端证书。
每个服务实例使用所选库中自己的数据。

### 维护表结构

当前表结构统一在[实体目录](src/entity/tables/)维护。表名、列属性、主键、索引、外键和检查约束以 TypeORM 装饰器声明。例如给成员表增加可空的备注字段，只需在 `KitMembersEntity` 添加以下属性。

```ts
@Column("text", { nullable: true })
declare remark: string | null;
```

从仓库根目录运行 `pnpm dev server`。开发服务在启动和 Entity 文件保存后检查结构差异。上例的可空列会自动生成一个新版本并写入迁移清单，然后服务启动，在配置的开发库上应用该版本。相同结构再次保存或重启会沿用已登记的版本。新增表时，在 `src/entity/tables/index.ts` 登记实体类。

提交前审核三库的升级步骤，将 Entity、迁移清单、版本快照和需要的显式步骤一起提交。可以运行以下命令校验这些文件。

```bash
pnpm --filter @openagentpack/kit-server db:check
```

构建、类型检查、测试和 OpenAPI 生成通过 `db:render` 核对已登记的版本，将三库产物写入本地的 `migrations/generated/`。缺少版本时这些命令会报告结构差异。
可用 `pnpm --filter @openagentpack/kit-server db:entities` 只读核对实体声明和方言映射。
构建后的 `dist/migrations/` 提供三库迁移 SQL 和结构快照。部署启动时，服务自动执行所选库待处理的
迁移，并登记结果。

新增表、可空列、带常量默认值的非空列和普通索引可由工具生成。
改名、改类型、删除或回填旧数据时，需要写明旧数据的处理方式。准备好步骤文件后运行 `pnpm --filter @openagentpack/kit-server db:generate --name <变更名> --steps <JSON 路径>`。JSON 的 `steps` 按顺序列出步骤。
每步填写 `kind`（`ddl` 或 `data`）及 `sqlite`、`mysql`、`postgres` 三个 SQL 字段。
MySQL 的每个 DDL 步骤只写一条原子语句。SQLite 需要重建被外键引用的表时，在 JSON 顶层设置
`sqliteRebuild: true`，迁移将在提交前检查外键。

三库按 [迁移清单](src/store/migration-manifest.json) 的条目顺序执行。原有 36 条在
[history/](src/store/migrations/history) 中逐条保存。生成命令会将新版本追加到同一份清单，并在
[versions/](src/store/migrations/versions) 保存版本快照和显式步骤。Store 在迁移锁下识别全新空库，通过 TypeORM 的方言驱动根据当前 Entity 元数据建表、写入产品初始数据，并登记已覆盖的版本。
已有库根据已完成的迁移 ID 逐版升级，数据回填或转换使用对应的历史步骤。产品初始数据变更时，同时更新空库的初始记录和旧库的数据迁移。

每张业务表在 `src/entity/tables/` 中有一个手写的 `@Entity` 类，列类型、可空性、主键和默认值写在对应属性的 TypeORM 装饰器上。JSON 文本列保留字符串属性。Store 将这些类直接注册为 TypeORM DataSource 的实体。每个连接独立解析列的物理类型、长度和排序规则；MySQL 保留生成列、前缀索引和表级排序规则。SQLite 复用 `node:sqlite` 连接，MySQL 和 PostgreSQL 复用已有池。
业务 Service 通过 Store 提供的 TypeORM EntityManager 访问实体。分页、统计和带条件的更新使用 QueryBuilder，同一事务内的操作共用连接。
TypeORM 的 `synchronize` 和 `migrationsRun` 均关闭。

## 代码结构

```text
src/app.ts          Nest 应用工厂
src/bin.ts          进程入口
src/config.ts       环境变量解析与校验
src/controller/     管理端、员工端及公开端点，按业务组织路由 Schema 与响应映射
src/http/           共享请求管线、路由装饰器、SSE 传输与 OpenAPI 生成
src/service/admin/  管理端用例，如目录管理、成员管理与资源发布
src/service/staff/  员工端用例，如已上架智能体查询与本人会话操作
src/service/shared/ 跨用例共用的业务类和规则，如附件挂载、会话状态推导、限额与确认闸门
src/entity/         一表一类的实体定义与三库 TypeORM 映射
src/store/          三库连接、SQL 执行、实体查询、事务与迁移
src/gateway/        bailian/ 和 mock/ 实现 Provider，shared/ 维护共享转换与 YAML 发布适配
src/module/         Nest 与 Express 应用、Controller 注册、配置与服务依赖装配
src/utils/          注入令牌、密码与签名、UTC 日期、事件缓存、限流和指标
tests/              路由、Gateway 合同、服务与恢复场景
openapi.json        由 Controller 元数据与 Zod Schema 生成，供文档站同步
```

业务调用从 Controller 进入 Service。Service 通过实体读写数据，在业务操作中划定事务。会话索引、审计、模版版本和额度计量等共用能力位于 `service/shared/`。
Nest 使用 `@Inject(StoreDatabase)` 提供同一数据库实例，远端访问经 Gateway。

## 验证

```bash
pnpm --filter @openagentpack/kit-server typecheck
pnpm --filter @openagentpack/kit-server test
pnpm gen:openapi          # 改了路由后重新生成 openapi.json
```

真实 Cloud 验证默认跳过，使用 `KIT_LIVE=1` 与 `.env` 中的测试凭据显式开启；测试资源
使用唯一前缀并在结束后清理。

## 相关文档

- [服务端不变量与闸门](./AGENTS.md)
- [接口与 op 对照表](../../docs/interfaces.md)
- [SSE 帧、重连与错误模型](../../docs/protocol.md)
- [进程与分层](../../docs/architecture.md)
- [验收矩阵](../../docs/validation.md)
