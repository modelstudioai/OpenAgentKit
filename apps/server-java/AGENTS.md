# apps/server-java — Spring Boot Kit Server

先读[仓库规则](../../AGENTS.md)、[架构](../../docs/architecture.md)、
[接口](../../docs/interfaces.md)与[协议](../../docs/protocol.md)。

## 职责与入口

- `controller/` 持有路由、请求校验、HTTP 鉴权入口、响应构造与 SSE 输出。
- `service/` 持有身份校验、业务规则、事务范围、会话回放及发布恢复。通过 `GatewayClient` 调用回环 Node 网关。
- `dao/` 按业务域封装查询、分页和写入。`store/` 提供 JDBC 连接、事务执行、共享迁移与启动结构校验。
- 依赖方向为 `controller → service → dao → store`，共用工具放在 `support/`。DAO 可以向 Service 返回通用记录值。
- Maven 构建通过 `check-layers.mjs` 校验层间导入。公开启动入口见 [README](README.md)。

## 不变量

1. 序列化的公开路由合同来自同一份 OpenAPI。内部 SDK 网关使用单独的服务令牌。
2. 会话事件和 Provider 凭据不落 Kit 数据库。持久化的执行数据遵循协议规定的字段与清理期限。
3. 一次性确认、认领与写入开始必须持久化后才允许远端发布。结果未知时保留检查点，禁止重发写入。
4. 使用共享迁移定义。回切 Hono 前停止 Java 和 SDK 网关，整个数据目录随配置保留。

## 修改步骤与验收

核对公开接口和 Hono 行为，修改临时执行或 SSE 时补风险用例。执行 `pnpm build:java`、
`pnpm test:java`；改数据库运行 `pnpm --filter @openagentpack/kit-server db:check`
并在三个本地数据库执行兼容性验收。
