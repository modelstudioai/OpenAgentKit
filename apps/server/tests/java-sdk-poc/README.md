# JDK 11 与 Node SDK 本地 PoC

Spring Boot 2.7.18 通过 HTTP 和 SSE 调用本机 Node 适配层。Node 复用仓库的 `createSdkGateway` 和 `@openagentpack/sdk@0.10.0`，通过实际 HTTP/SSE 连接本地百炼替身。PoC 验证一个预置会话和一个 Environment → Agent 批次。

## 一键验收

构建使用 Node 24 或更新版本、JDK 11 和 Maven 3.9.11。用 `POC_JAVA_HOME` 指定 JDK 11 安装目录，用 `POC_MAVEN` 指定 Maven 的可执行文件。脚本默认从仓库的 `.scratch/java-sdk-poc/.toolchain/` 读取已解包的 macOS JDK 和 Maven。JDK 的默认入口为 `java11/Contents/Home/bin/java`，Maven 的默认入口为 `apache-maven-3.9.11/bin/mvn`。

从仓库根目录准备工作区依赖并运行验收：

```bash
pnpm install
pnpm --filter @openagentpack/kit-sdk build
node apps/server/tests/java-sdk-poc/verify.mjs
```

Maven 首次构建使用公开仓库。已构建后可加 `--skip-build` 直接运行本地验收，用 `--case=publish_restart` 等参数可单独运行某条用例。脚本显式启动 Java、Node、替身和故障代理，全部监听回环地址，凭据随机生成。构建产物、临时 SQLite 和验收证据都在仓库的 `.scratch/java-sdk-poc/` 下，执行结果位于脚本输出的 `runs/run-*/evidence.json`。

## 验收项

| 用例 | 故障与断言 |
| --- | --- |
| `client_resume` | 客户端断开后用 `after` 恢复，原 epoch 回放期间的最终快照，SDK 订阅保持一条 |
| `upstream_resume` | 切断 Java 到 Node 的 SSE，Java 在新 epoch 补齐分页历史并输出 reset 和 ready |
| `publish_disconnect` | Environment 检查点后切断执行连接，保留回写通道，按原 Operation 读回成功与两个绑定，重启 Java 再确认 |
| `publish_restart` | 替身已记录 Agent 创建请求，故意扣住响应，随后重启 Node。原 Operation 结果为 unknown，保留 Environment 检查点和只读核对入口 |

会话场景统计实际消息 POST 次数。发布场景校验无效及已消费令牌、检查点重复回写，以及每种资源与执行入口的调用次数。Java 只将发布执行记录、SDK 检查点及绑定写入临时 SQLite，会话正文保存在内存。
