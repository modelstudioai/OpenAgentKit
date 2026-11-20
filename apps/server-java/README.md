# Spring Boot Kit Server

Java 负责 Kit HTTP、v2 SSE 和数据库，Node 网关继续调用 `@openagentpack/sdk@0.10.0`。
运行要求为 JDK 11、Spring Boot 2.7.18、Maven 3.9.11、Node ≥24 及仓库锁定的 pnpm。

## 代码分层

Java 源码按 `controller → service → dao → store` 组织。Controller 处理 Kit 请求与 SSE 响应，
Service 执行业务规则并定义事务范围，DAO 封装各业务域的 SQL，Store 提供 JDBC、事务与三库迁移。
会话入口从 `SessionController` 调用 `SessionService`，会话目录与绑定记录由 `SessionDao` 读写。
Service 通过 `GatewayClient` 调用 Node SDK 网关。

## 构建和启动

在 Kit 仓库根目录执行以下命令。

```bash
pnpm install --frozen-lockfile
pnpm build:java
pnpm start:java
```

构建和启动会读取当前 worktree 的本地工具链配置 `.scratch/java-toolchain.env`。这个文件由 Git 忽略，
可一次性填入已有工具的安装位置。支持 `JAVA_HOME`（JDK 11 安装目录）、`KIT_MAVEN`（Maven 3.9.11
可执行文件）、`KIT_JAVA_NODE`（Node.js 24 或更新版本的可执行文件绝对路径）和 `MAVEN_OPTS`
（如指定 Maven 依赖缓存）。命令环境中显式设置的同名值优先，配置缺省时沿用调用环境中的工具。

启动器原样读取已有 `.env`，采用 Kit 启动器的现有覆盖规则。`pnpm start:java --isolated` 忽略
根 `.env`，可配合独立 `KIT_DATA_DIR`、`KIT_GATEWAY=mock` 和自定端口运行。
配置身份与管理员令牌后，用 Web 和 Console 的现有 API base 配置指向同一个 Java 地址，
例如 `?api=http%3A%2F%2F127.0.0.1%3A8787`。

| 变量 | 用途 | 默认 |
| --- | --- | --- |
| `PORT` / `KIT_BIND_ADDRESS` | Java 公开 HTTP 与 SSE | `8787` / `127.0.0.1` |
| `KIT_SDK_PORT` | Node SDK 回环入口 | `8791` |
| `KIT_SDK_CALLBACK_PORT` | Java 回环回写入口 | `8792` |
| `KIT_SDK_GATEWAY_TOKEN` / `KIT_SDK_CALLBACK_TOKEN` | 各内部方向的专用服务令牌 | 启动器生成随机值 |
| `KIT_GATEWAY`、`BAILIAN_API_KEY`、`BAILIAN_BASE_URL` 或 `BAILIAN_WORKSPACE_ID` | Node Provider 配置 | 同 Hono 配置 |
| `KIT_DATA_DIR` | 持久目录、SQLite 数据库和资源上传 | `.data` |
| `KIT_DB_DRIVER` / `KIT_DATABASE_URL` | `sqlite`、`mysql`、`postgres`；后两者需要 Database URL | `sqlite` |

SQLite 数据库位于 `KIT_DATA_DIR/kit.sqlite`。MySQL 使用 MySQL 8.4，PostgreSQL 使用
PostgreSQL 16。Database URL 使用 `mysql://` 或 `postgresql://` 前缀。三库首次启动应用共享迁移。
部署应保留同一数据目录、认证配置和确认密钥；从 Java 回切时，先退出 Java 和 SDK
网关，再用相同配置启动同版本 Hono。结果未知的 Operation 用原 ID 核对。

## 验收与发布

```bash
pnpm test:java
pnpm build:release:java
```

兼容性测试读取 `KIT_TEST_MYSQL_URL` 和 `KIT_TEST_POSTGRES_URL`，只接收本机回环
连接。测试在专用临时数据库执行并清理；SQLite 与故障注入的临时文件位于
`.scratch/java-server-tests/`。

构建 Web 和 Console 后，设置 `KIT_JAVA_TEST_BROWSER=1` 验证浏览器的成员登录、实时对话和
管理查询。可设 `KIT_JAVA_BROWSER_CHANNEL=chrome` 使用本机 Chrome；默认使用 Playwright Chromium。

解包 `.scratch/kit-java-release.tgz` 后用 `node server-java/start.mjs` 启动。
同版本 Hono 回切使用 `node server/dist/bin.js`。发布包包含 Web、Console 与
文档站静态产物。Provider 凭据由部署环境提供，仅传入 Node 网关。
