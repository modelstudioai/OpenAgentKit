# 0028 Spring Boot Kit Server 与 Node SDK 网关

状态：已接受。

## 背景

JDK 11 环境需要运行 Kit 的数据面与控制面。上游 SDK 以 Node.js 运行，负责百炼事件映射、对象 Plan、发布及 SDK state。PoC 验证了会话续传和发布检查点的跨进程恢复。

## 决策

- JDK 11、Spring Boot 2.7.18 和 Maven 3.9.11 承载 Kit 公开 HTTP 与 v2 SSE、身份、一次性确认、用量和状态。Spring Boot 2.7 的开源维护已结束，保留 JDK 11 是本次交付的约束。
- 同主机 Node 24 网关经回环 HTTP/SSE 调用原版本 `@openagentpack/sdk@0.10.0`。网关和 Java 回写入口各有服务身份，Provider 凭据仅注入网关。Kit 数据库由 Java 单写；SDK 检查点和结果经回写入口落库。
- 保留同版本 Hono 作为可回切入口。两套入口消费同一公开 OpenAPI、同一 SQLite 历史和 MySQL / PostgreSQL 迁移计划。切换前停止当前写实例，保留数据目录及同一确认密钥；回切待核对的发布遵循原有只读恢复规则。

## 影响

前端和 Kit SDK 继续使用现有合同。部署需要在同主机运行两个进程，并管理 Node 与 JDK 生命周期。确认令牌消费、SDK 写入许可和检查点由 Java 持久化；网关失联且远端结果未知时保留已知结果，等待人工核对。SDK 重新实现与延续纯 Hono 方案分别会扩大上游兼容面或无法满足 Java 运行要求，本次采用双进程。
