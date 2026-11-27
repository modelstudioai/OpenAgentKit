---
name: kit-keycloak
description: "为 OpenAgentKit 员工端接入 Keycloak OIDC 登录。适用于联动启动本地 Keycloak、使用预置发行包或已有 Realm、配置成员绑定，以及验证和排查企业登录。"
---

# 为 Kit 接入 Keycloak 员工登录

Kit Web 通过 Keycloak 的授权码与 PKCE S256 登录。Kit Server 校验该 Realm 签发的
access token，并用 `(iss, sub)` 找到对应的 `member_id`。

先核对当前仓库的 `.env.example`、`apps/server/README.md` 和实际运行的 Kit 服务。
本地开发读取仓库根目录的 `.env.development`，生产启动读取 `.env.production`。
部署时可由服务进程环境注入相同变量。已有配置按所选接入方式调整认证相关项。
凭据通过本地配置或部署环境注入，示例和交付记录使用占位符。

## 启用或关闭 Keycloak

`KIT_KEYCLOAK_ENABLED` 默认为 `true`。需要关闭时，在 `.env.development` 中设置
以下值，保存后重新运行启动命令。

```dotenv
KIT_KEYCLOAK_ENABLED=false
```

关闭后，开发脚本跳过本地 Keycloak 启动，Kit 停用 OIDC 登录和企业账号绑定。
接入已有 Keycloak 时也适用。原 `KIT_AUTH_MODE=oidc` 会按 `member` 运行，
员工使用 Kit 账号密码登录。

## 本地联动启动

macOS 或 Linux 上，安装项目依赖后在仓库根目录运行 `pnpm dev server`。
需要同时打开体验页和 Console 时运行 `pnpm dev`。默认开发配置或显式设置
`KIT_AUTH_MODE=oidc` 且省略 `KIT_OIDC_ISSUER` 时，脚本会自动准备本地 Keycloak，
创建或复用 `kit` Realm 和 `kit-web` 客户端。默认 issuer 为
`http://127.0.0.1:8180/realms/kit`，API 受众为 `kit-api`。

首次下载使用 `curl` 和 `tar`，需要访问 GitHub Releases。脚本会复用兼容的 Java，
并在支持的系统上按需下载 Temurin 21。运行数据保存在 `.scratch/keycloak/`，
本地 Keycloak 管理员凭据由脚本生成到 `.scratch/keycloak-bootstrap-admin.json`。
重启会复用已有 Realm、客户端和用户。

### 使用预置发行包

将已解压的 Keycloak 目录放在本地并让 `KIT_KEYCLOAK_HOME` 指向包含 `bin/kc.sh` 的目录。
如需指定随包提供的 Java，配置 `KIT_KEYCLOAK_JAVA_HOME` 指向包含 `bin/java` 的目录。
这两个变量的相对路径从仓库根目录解析。

```dotenv
KIT_AUTH_MODE=oidc
KIT_KEYCLOAK_HOME=vendor/keycloak
# KIT_KEYCLOAK_JAVA_HOME=vendor/java
```

复用已初始化的本地实例时，可用 `KIT_KEYCLOAK_ADMIN_FILE` 指定该实例的管理员 JSON
文件，字段为 `username` 和 `password`。

## 接入已有 Keycloak

1. 在目标 Realm 创建公开的 OpenID Connect 客户端，例如 `kit-web`。启用 Standard flow
   和 PKCE S256，以授权码流程登录。关闭 Client authentication、Direct access grants
   和 Implicit flow。
2. 将体验页实际访问的协议、域名、端口与路径登记到 Valid redirect URIs，Web Origins
   配置对应的源。前端与 Kit Server 跨域部署时，在 `KIT_CORS_ORIGINS` 放行实际的
   Web 和 Console 源。
3. 添加 Audience mapper，在 Included Custom Audience 填入 `kit-api`，并启用
   Add to access token。使用 Kit 支持的 RS256 签名 JWT access token。
4. 将以下变量填入 Kit 配置，按实际 Realm 和客户端修改。issuer 必须与 OIDC 发现文档
   中的 `issuer` 一致，使用 HTTPS，回环地址支持 HTTP。从本地联动切换到独立实例时，
   移除 `KIT_KEYCLOAK_HOME`。已有成员可先配置三项 `KIT_OIDC_*` 并完成预绑定，再切换
   `KIT_AUTH_MODE`。

   ```dotenv
   KIT_AUTH_MODE=oidc
   KIT_OIDC_ISSUER=https://sso.example.com/realms/kit
   KIT_OIDC_CLIENT_ID=kit-web
   KIT_OIDC_AUDIENCE=kit-api
   ```

   需要同时提供 Kit 成员密码登录时设置 `KIT_OIDC_PASSWORD_LOGIN=true`。
   认证配置变更后重启当前工作区的 Kit Server。

## 绑定成员与验收

1. 在 Keycloak 的目标 Realm 准备员工账号。Kit Console 的「创建用户」可以直接填写
   Keycloak 用户 ID，已有成员可在成员列表选择「企业绑定」。绑定字段使用 Keycloak
   令牌的 `sub`，默认与 Keycloak Users 页中的用户 ID 一致。绑定后重新发起企业登录，
   使用绑定生效后签发的令牌。
2. 使用实际服务地址检查 `/healthz`、`/api/config` 和 Realm 的发现文档。确认
   Kit 返回的 `data.auth.mode` 为 `oidc`，`data.auth.oidc` 中的 issuer 和客户端与
   预期一致。以下是默认本地端口的检查命令。

   ```bash
   curl -fsS http://127.0.0.1:8787/healthz
   curl -fsS http://127.0.0.1:8787/api/config
   curl -fsS http://127.0.0.1:8180/realms/kit/.well-known/openid-configuration
   ```

3. 用已绑定的测试账号从体验页完成「企业登录」。确认 `GET /api/kit/auth/me` 返回的
   `data.member.member_id` 是预期成员。Kit Console 使用 `ADMIN_TOKEN`，没有 `.env.development`
   时可由 `pnpm start:dev` 引导生成。

## 排查启动或登录失败

| 表现 | 核对点 |
| --- | --- |
| 首次启动停在下载或 Java 探测 | 核对 GitHub 下载连接、`curl`、`tar` 与 Java 路径。已有发行包可通过 `KIT_KEYCLOAK_HOME` 复用。 |
| 登录页提示回跳地址无效 | 比较浏览器实际地址和 Valid redirect URIs，包括 `localhost` 与 `127.0.0.1` 的差异。本地 React 端口可通过 `KIT_WEB_DEV_PORT` 调整，重启后会补齐本地回跳地址。 |
| `403 member_not_bound` | 核对当前 issuer 和 Keycloak 用户的 `sub`，在 Console 绑定正确的 Kit 成员。 |
| 员工 API 返回 `401` | 核对 access token 的有效期、`iss`、`aud` 和 `azp`。`aud` 应包含 Kit API 受众，`azp` 应为 Kit Web 客户端。换绑后重新登录。 |
| 获取公钥失败或返回可重试 `502 provider_error` | 从 Kit Server 运行环境检查 issuer 下的 `/protocol/openid-connect/certs` 是否可访问。 |
