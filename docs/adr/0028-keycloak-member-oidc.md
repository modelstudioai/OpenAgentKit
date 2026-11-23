# ADR-0028：Keycloak OIDC 与成员身份绑定

## 背景

员工需要使用企业身份登录 Kit，并继续使用原有成员的会话、附件与限额。部署还需支持在
Keycloak 上游逐步接入钉钉、飞书等企业身份源。

## 决策

1. 独立部署默认使用 `member` 模式。部署可切换至 `oidc`，员工端走 Keycloak OIDC 授权码和
   PKCE S256，业务 API 直接使用 Keycloak 的 access token。该模式关闭员工密码登录，
   并拒绝旧 Kit 成员令牌、兼容外部 JWT 和匿名访问。控制面继续使用管理端身份。
2. Kit Server 固定信任一个配置好的 Keycloak Realm，并从该 Realm 获取签名公钥。
   验证 RS256 签名、issuer、API audience、授权客户端、有效期和令牌用途之后，
   用 `(iss, sub)` 匹配管理员显式维护的一对一成员绑定。员工登录保持既有 `member_id`。
3. Web 内存保存 Keycloak 令牌。SDK 重新通过 `auth.me` 确认续期仍是同一 Kit 成员，
   再用新令牌和原游标续接 SSE。退出只撤销本次 Kit 登录使用的有效 access token，
   保留 Keycloak 的统一登录会话。Kit 数据库保存撤销标识的哈希直到令牌到期。
4. Keycloak 管理上游 OAuth 身份代理和账号关联。钉钉或飞书用户关联到原 Realm 用户后，
   Kit 可继续使用同一个 `(iss, sub)` 绑定。

## 理由

Keycloak 负责签发凭据，Kit 负责业务授权和成员归属。以 issuer 和 subject 定位身份，
可避免邮箱、昵称或上游提供方变更触发自动账号合并。固定 API audience 约束令牌使用范围。

## 后果

切换前可先配置 Realm 和绑定。解绑即时停止对应 Kit 访问和 SSE，重新绑定要求使用绑定后
签发的令牌。删除或跨 Realm 重建 Keycloak 用户会产生新的身份绑定需求。

本地验签依赖 access token 有效期感知 Keycloak 侧停用或退出。需要即时收回 Kit 访问时，
管理员可在 Kit 解绑。Keycloak 独立部署，开发与生产配置见[服务端 README](../../apps/server/README.md)。

macOS / Linux 开发入口在认证模式和 issuer 均未配置时准备并启动本地 Keycloak，覆盖干净克隆的
开发场景。Realm 与客户端按需创建，开发库和启动凭据存放在 Git 忽略的目录。

## 备选方案

由 Kit 为每个企业身份源分别对接 OAuth，或在回调后再签发 Kit Bearer。两种方案都增加
Kit 需要长期维护的凭据或令牌生命周期，因此本期统一使用 Keycloak 签发的凭据。
