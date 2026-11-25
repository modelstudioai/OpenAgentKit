# OpenAgentKit 术语表

本仓库是开源侧 OpenAgentKit。术语表收录跨侧协作（业务侧 Solution 对接）反复使用的概念，
避免「塞尔达」「MA」这类内部代号在讨论与文档中口径漂移。

## Language

### 平台与接口

**MA（Managed Agent）**:
百炼平台内的 Managed Agent 平台，提供对外与对内两套 API。
_Avoid_: 单独使用「平台」（易与百炼整体混淆）

**MA OpenAPI**:
MA 对外的开放 API，开源侧数据面所依赖的接口。
_Avoid_: 对外接口、公网 API

**塞尔达（Zelda）**:
MA 对内 API 的代号，业务侧直连使用；与 MA OpenAPI 接口同构。
_Avoid_: 内网 API、MA 内部接口

### 两侧

**开源侧**:
OpenAgentKit（本仓库）及其组件、服务与文档的统称。
_Avoid_: Kit、开源版本

**业务侧（Solution）**:
以 Solution 为整体维度的解决方案交付产品；复用开源侧 Chat UI 组件，直连塞尔达并配套自建服务。
_Avoid_: 商业侧、客户侧

**Solution**:
业务侧的整体交付单元，聚合一个或多个 Agent；MA OpenAPI 与塞尔达均无此概念。
_Avoid_: 方案（歧义）

### 业务侧自建能力

**会话置顶**:
用户 × 会话维度的置顶标记；MA OpenAPI 与塞尔达均不提供，两侧各自落库承载。
_Avoid_: 钉住、收藏

**Solution 级品牌**:
Solution 维度、全局生效的头像与名称定制；MA 不提供，两侧自建承载。
_Avoid_: 助手人设、Agent 昵称
