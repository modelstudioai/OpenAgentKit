# ADR-0033：Kit Server 使用 NestJS

## 状态

已接受。迁移起点为 Hono 的 `801c02a`。合入 ADR-0032 后，兼容基线为主线 `cd26a52` 的 130 条路径、162 个 HTTP 操作及 034 数据库迁移。

## 背景

Kit Server 同时承载数据面、控制面、调试和批次发布。服务端的共享订阅、确认令牌和发布状态
有明确的进程生命周期，HTTP 路由和业务服务需要统一管理依赖和清理顺序。

## 决策

- 在 Node 24 ESM 上使用 NestJS 12.6.0 与 Express Adapter。成员、会话与附件、目录与模版、
  资源发布、管理调试分模块装配，通过显式注入令牌组装配置、数据库、Store 和 Provider gateway。
- Controller 将业务交给 Service。实体读写和事务随用例归属到 Service，跨域共用的能力放入 `service/shared/`。
  Service 共享 Store 提供的事务，经 Gateway 访问 Provider，
  Nest 依赖装配位于 `module/`，由依赖规则约束各层的调用方向。
- Controller 按业务域直接注入 Service 类，同域入口共享实例。业务用例由类的实例方法执行，通用技术组件由 `utils/` 提供。
- 使用应用级单例维护 SSE 共享订阅、限流、确认令牌和操作执行器。资源发布在每个批次内缓存运行时，
  沿用该批次的计划、互斥、执行回执及清理语义。
- 在 HTTP 边界统一处理身份、只读角色、协议版本、请求体限额和错误。普通 Controller 返回流式
  Fetch `Response`，沿用 Kit SSE 帧和游标，使用取消信号协调客户端断开、登录撤销及进程关停。
- 通过 Controller 元数据与已有 Zod Schema 生成 OpenAPI 3.1。在线文档、`pnpm gen:openapi`
  和 SDK 类型生成共享该定义。
- `createApp(config)` 返回已初始化的 Nest 应用，由宿主开始监听。生产 CLI 从 `dist/bin.js`
  启动，响应 SIGINT/SIGTERM 时先释放 HTTP 和流连接，再关闭数据库。

## 理由与后果

Nest 模块让依赖、状态归属和关停顺序可在实际生产装配中验证。HTTP 路径、状态码、响应、
SSE 及 OpenAPI 作为现行客户端的兼容合同。继续使用当前数据库 Schema、迁移记录与 Provider 合同。
本次切换仍按单服务实例部署。回滚时可运行上一版 Hono 发布包，沿用现有数据库和配置。

## 备选方案

继续维护 Hono 的手动服务装配。该方案便于保持现状，应用生命周期与 HTTP 合同的组织仍依赖各入口自行协调。
