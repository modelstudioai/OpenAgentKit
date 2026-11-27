/**
 * 依赖方向守护。每条规则都在对应包的 AGENTS.md 里点名，改动规则前请先改文档。
 *
 * 分层：sdk/protocol ← sdk ← chat-ui；server 只依赖 sdk/protocol 与 sdk 数据入口；
 * sdk 数据入口禁 React/Vue；React 仅限 hooks/ 与 Kit React 接入，Vue 仅限 hooks-vue/ 与 Kit Vue 接入；
 * chat-ui / chat-ui-vue 互不依赖且禁 server；
 * antd 仅限 apps/console（ADR-0015）。
 */
const sdkReact = "^packages/sdk/src/(hooks/|providers/kit/react/|(chat|sessions|files|agents|usage|auth)/hooks/)";
const sdkVue = "^packages/sdk/src/(hooks-vue/|providers/kit/vue/|(chat|sessions|files|agents|usage|auth)/hooks-vue/)";
const sdkEntryModules =
	"chat|sessions|files|usage|auth|messages|config|request|stream|providers|providers/kit|providers/kit/react|providers/kit/vue|providers/session-events|providers/bailian|protocol|hooks|hooks-vue|chat/hooks|chat/hooks-vue|sessions/hooks|sessions/hooks-vue|files/hooks|files/hooks-vue|agents/hooks|agents/hooks-vue|usage/hooks|usage/hooks-vue|auth/hooks|auth/hooks-vue";
const sdkPublicSources = `^packages/sdk/src/(state\\.ts|(${sdkEntryModules})/index\\.ts)$`;
const sdkPublicDist = `^packages/sdk/dist/(state|${sdkEntryModules})\\.(js|d\\.ts)$`;

module.exports = {
	forbidden: [
		{
			name: "server-no-directory-sdk",
			comment: "ADR-0018：Kit 资源发布只使用 SDK 对象入口，不依赖目录项目或源码版本",
			severity: "error",
			from: { path: "^apps/server/src/" },
			to: { path: "@openagentpack/sdk/dist/project-(workspace|versions)" },
		},
		{
			name: "server-database-drivers-in-store",
			comment: "Kit 数据库驱动由服务端 Store 层持有",
			severity: "error",
			from: { path: "^apps/server/src/", pathNot: "^apps/server/src/store/" },
			to: { path: "(^|/)(mysql2|pg)(/|$)|^(node:)?sqlite$", dependencyTypesNot: ["type-only"] },
		},
		{
			name: "server-entity-no-upgrade-history",
			comment: "实体映射、建表与物理结构校验独立于旧库升级代码",
			severity: "error",
			from: { path: "^apps/server/src/(entity/|store/(metadata/|typeorm\\.ts$|entity-tables\\.ts$|baseline\\.ts$))" },
			to: { path: "^apps/server/src/store/migrations/" },
		},
		{
			name: "server-typeorm-in-persistence",
			comment: "Service 通过 TypeORM 访问实体，数据库驱动归 Store 管理",
			severity: "error",
			from: { path: "^apps/server/src/", pathNot: "^apps/server/src/(service|entity|store)/" },
			to: { path: "(^|/)typeorm(/|$)" },
		},
		{
			name: "server-core-no-http",
			comment: "Service、持久化、Gateway 和通用技术组件独立于 HTTP 传输层",
			severity: "error",
			from: { path: "^apps/server/src/(service|entity|store|gateway|utils)/" },
			to: { path: "^apps/server/src/(controller|http)/|(^|/)(express|@nestjs/platform-express)(/|$)" },
		},
		{
			name: "server-http-no-controller",
			comment: "Controller 使用共享 HTTP 组件，应用模块提供 OpenAPI 所需的 Controller 清单",
			severity: "error",
			from: { path: "^apps/server/src/http/" },
			to: { path: "^apps/server/src/controller/" },
		},
		{
			name: "server-http-no-infrastructure",
			comment: "Controller 与共享 HTTP 组件透过业务服务访问数据库和 Provider",
			severity: "error",
			from: { path: "^apps/server/src/(controller|http)/" },
			to: { path: "^apps/server/src/(entity|store|gateway|module)/|node_modules/@openagentpack/sdk/" },
		},
		{
			name: "server-admin-no-staff-service",
			comment: "管理端 Controller 与 Service 只依赖管理端或共享业务服务",
			severity: "error",
			from: { path: "^apps/server/src/(controller|service)/admin/" },
			to: { path: "^apps/server/src/service/staff/" },
		},
		{
			name: "server-staff-no-admin-service",
			comment: "员工端 Controller 与 Service 只依赖员工端或共享业务服务",
			severity: "error",
			from: { path: "^apps/server/src/(controller|service)/staff/" },
			to: { path: "^apps/server/src/service/admin/" },
		},
		{
			name: "server-shared-no-role-service",
			comment: "共享业务服务独立于两端专属用例",
			severity: "error",
			from: { path: "^apps/server/src/service/shared/" },
			to: { path: "^apps/server/src/service/(admin|staff)/" },
		},
		{
			name: "server-service-persistence-api",
			comment: "业务服务使用实体表、StoreDatabase 和查询表达式，连接、驱动、迁移和装配留在基础设施层",
			severity: "error",
			from: { path: "^apps/server/src/service/" },
			to: {
				path: "^apps/server/src/(entity|store|module)/|(^|/)typeorm/(?:driver|query-runner)/",
				pathNot: "^apps/server/src/(entity/tables/|store/(database|sql)\\.ts$)",
			},
		},
		{
			name: "server-business-rules-in-services",
			comment: "业务规则由所属 Service 或共享 Service 的实例方法实现",
			severity: "error",
			from: { path: "^apps/server/src/" },
			to: { path: "^apps/server/src/domain/" },
		},
		{
			name: "server-persistence-no-service",
			comment: "持久化层不依赖业务编排、Provider 或应用模块",
			severity: "error",
			from: { path: "^apps/server/src/(entity|store)/" },
			to: { path: "^apps/server/src/(service|gateway|module)/" },
		},
		{
			name: "server-utils-no-business",
			comment: "服务端通用组件独立于业务、持久化、Provider 适配和应用装配",
			severity: "error",
			from: { path: "^apps/server/src/utils/" },
			to: { path: "^apps/server/src/(service|entity|store|gateway|module)/" },
		},
		{
			name: "server-gateway-no-business",
			comment: "Provider 适配独立于业务编排与持久化",
			severity: "error",
			from: { path: "^apps/server/src/gateway/" },
			to: { path: "^apps/server/src/(service|entity|store|module)/" },
		},

		{
			name: "server-bailian-no-mock",
			severity: "error",
			from: { path: "^apps/server/src/gateway/bailian/" },
			to: { path: "^apps/server/src/gateway/mock/" },
		},
		{
			name: "server-mock-no-bailian",
			severity: "error",
			from: { path: "^apps/server/src/gateway/mock/" },
			to: { path: "^apps/server/src/gateway/bailian/" },
		},
		{
			name: "server-no-concrete-provider-imports",
			severity: "error",
			from: { path: "^apps/server/src/(service/|gateway/(shared/|types\\.ts$))" },
			to: { path: "^apps/server/src/gateway/(bailian|mock)/" },
		},
		{
			name: "no-circular",
			comment: "循环依赖会让分层与打包顺序失效",
			severity: "error",
			from: {},
			to: { circular: true },
		},
		{
			name: "sdk-protocol-no-kit-layers",
			comment: "SDK /protocol 子入口是同构契约层，不得依赖 SDK 其他入口、chat-ui 或 apps",
			severity: "error",
			from: { path: "^packages/sdk/src/protocol/", pathNot: "\\.test\\.ts$" },
			to: { path: "^packages/sdk/src/(?!protocol/)|^packages/chat-ui/src|^apps/" },
		},
		{
			name: "sdk-protocol-no-upstream-sdk-runtime",
			comment:
				"SDK /protocol 只允许 type-only 引用 @openagentpack/sdk 主入口；运行时映射只能走浏览器安全的 ./session-events 子路径",
			severity: "error",
			from: { path: "^packages/sdk/src/protocol/", pathNot: "\\.test\\.ts$" },
			to: {
				path: "node_modules/@openagentpack/sdk/dist/index\\.js$",
				dependencyTypes: ["npm"],
			},
		},
		{
			name: "sdk-data-no-react",
			comment: "SDK 数据处理入口必须能在 Node 与 WebView 同跑：禁 React、react-dom、Radix",
			severity: "error",
			from: { path: "^packages/sdk/src/", pathNot: sdkReact },
			to: { path: "node_modules/(react|react-dom|@radix-ui)/" },
		},
		{
			name: "sdk-data-no-vue",
			comment: "SDK 数据处理入口必须能在 Node 与任意 UI 框架同跑：禁 vue",
			severity: "error",
			from: { path: "^packages/sdk/src/", pathNot: sdkVue },
			to: { path: "node_modules/vue/" },
		},
		{
			name: "sdk-vue-no-react",
			comment: "Vue adapter 只包装 SDK 数据能力，不得依赖 React、Radix、chat-ui 或 apps",
			severity: "error",
			from: { path: sdkVue },
			to: {
				path: "node_modules/(react|react-dom|@radix-ui)/|^packages/chat-ui/src|^packages/chat-ui-vue/src|^apps/",
			},
		},
		{
			name: "chat-ui-vue-no-react",
			comment: "Vue 组件库不得依赖 React 版 chat-ui、React、Radix React 或 apps",
			severity: "error",
			from: { path: "^packages/chat-ui-vue/src" },
			to: { path: "node_modules/(react|react-dom|@radix-ui)/|^packages/chat-ui/src|^apps/" },
		},
		{
			name: "sdk-data-no-react-adapter",
			comment: "SDK 数据实现不得反向导入共享 React 工具或任一功能的 React 接入",
			severity: "error",
			from: { path: "^packages/sdk/src/", pathNot: sdkReact },
			to: { path: sdkReact },
		},
		{
			name: "sdk-data-no-ui-layers",
			comment: "SDK 数据入口不得反向依赖 chat-ui 或 apps（包括 Console 管理业务）",
			severity: "error",
			from: { path: "^packages/sdk/src/", pathNot: sdkReact },
			to: { path: "^packages/chat-ui/src|^apps/" },
		},
		{
			name: "sdk-react-no-chat-ui-server",
			comment: "React adapter 只包装 SDK 数据能力，不得依赖 chat-ui 或 server",
			severity: "error",
			from: { path: sdkReact },
			to: { path: "^packages/chat-ui/src|^apps/" },
		},
		{
			name: "sdk-hooks-boundary",
			comment: "通用 hooks 只依赖状态、协议与内部工具，不依赖 Kit 或功能工作流",
			severity: "error",
			from: { path: "^packages/sdk/src/hooks/", pathNot: "\\.test\\.tsx?$" },
			to: { path: "^packages/sdk/src/(?!hooks/|state\\.ts$|protocol/|internal/)" },
		},
		{
			name: "sdk-kit-react-boundary",
			comment: "Kit React 接入只依赖 Kit 自身，不依赖其他 Provider 或功能工作流",
			severity: "error",
			from: { path: "^packages/sdk/src/providers/kit/react/", pathNot: "\\.test\\.tsx?$" },
			to: { path: "^packages/sdk/src/(?!providers/kit/)" },
		},
		{
			name: "sdk-stream-boundary",
			comment: "Stream 只依赖 protocol 与内部取消工具，不得反向依赖 Request/Provider/Chat",
			severity: "error",
			from: { path: "^packages/sdk/src/stream/", pathNot: "\\.test\\.ts$" },
			to: { path: "^packages/sdk/src/(?!stream/|protocol/|internal/)" },
		},
		{
			name: "sdk-request-boundary",
			comment: "Request 只依赖自身、协议与内部取消工具；可以消费 Stream，不得依赖功能模块",
			severity: "error",
			from: { path: "^packages/sdk/src/request/", pathNot: "\\.test\\.ts$" },
			to: { path: "^packages/sdk/src/(?!request/|stream/|protocol/|internal/)" },
		},
		{
			name: "sdk-provider-boundary",
			comment: "Provider 只依赖请求、协议、纯消息转换与独立目录读取，不反向依赖功能工作流",
			severity: "error",
			from: { path: "^packages/sdk/src/providers/", pathNot: "\\.test\\.ts$|/fixtures/" },
			to: {
				path: "^packages/sdk/src/(?!providers/|request/|stream/|protocol/|messages/|internal/|sessions/load-directory\\.ts$)",
			},
		},
		{
			name: "sdk-session-directory-loader-boundary",
			comment: "Client 共用的会话目录读取只依赖协议与取消工具，不能依赖 Client、状态或会话工作流",
			severity: "error",
			from: { path: "^packages/sdk/src/sessions/load-directory\\.ts$" },
			to: { path: "^packages/sdk/src/(?!protocol/|internal/)" },
		},
		{
			name: "sdk-state-boundary",
			comment: "通用状态只依赖协议，不得反向依赖请求、Provider、会话或应用业务",
			severity: "error",
			from: { path: "^packages/sdk/src/state\\.ts$" },
			to: { path: "^packages/sdk/src/(?!protocol/)|^packages/chat-ui/|^apps/" },
		},
		{
			name: "apps-sdk-public-entries",
			comment: "应用只能消费 SDK 的公开入口，不得依赖私有源码或构建分片（ADR-0025）",
			severity: "error",
			from: { path: "^apps/" },
			to: {
				path: "^packages/sdk/(src|dist)/",
				pathNot: [sdkPublicSources, sdkPublicDist],
			},
		},
		{
			name: "sdk-chat-boundary",
			comment: "聊天核心不反向依赖 Composer 或其他功能工作流；公开聚合入口可导出 Composer",
			severity: "error",
			from: {
				path: "^packages/sdk/src/chat/",
				pathNot: "\\.test\\.ts$|^packages/sdk/src/chat/(hooks/|hooks-vue/|index\\.ts$|composer\\.ts$)",
			},
			to: { path: "^packages/sdk/src/(chat/composer\\.ts$|sessions/|files/|agents/|usage/|auth/)" },
		},
		{
			name: "sdk-message-transform-boundary",
			comment: "消息转换只处理协议快照与展示数据，不依赖网络、后端接入或 Chat 状态",
			severity: "error",
			from: { path: "^packages/sdk/src/messages/", pathNot: "\\.test\\.ts$" },
			to: { path: "^packages/sdk/src/(?!messages/|protocol/)" },
		},
		{
			name: "sdk-data-no-bailian",
			comment: "百炼 SDK 转换仅从 providers/bailian 独立入口加载；其他功能模块不引入",
			severity: "error",
			from: {
				path: "^packages/sdk/src/",
				pathNot: "\\.test\\.tsx?$|^packages/sdk/src/(providers/bailian/|protocol/)",
			},
			to: { path: "^packages/sdk/src/providers/bailian/|node_modules/@openagentpack/sdk/" },
		},
		{
			name: "chat-ui-must-not-depend-on-server",
			comment: "组件库不得引入服务端代码或凭据",
			severity: "error",
			from: { path: "^packages/chat-ui/src" },
			to: { path: "^apps/server/src" },
		},
		{
			name: "server-must-not-depend-on-ui",
			comment: "apps/server 只依赖 protocol 与 SDK 数据入口；不得引入 React adapter/chat-ui/web/console",
			severity: "error",
			from: { path: "^apps/server/src" },
			to: { path: `${sdkReact}|^packages/chat-ui/src/|^apps/(web|console|storybook)/` },
		},
		{
			name: "eval-node-only-consumers",
			comment: "kit-eval 是 Node 侧评测管线（碰 SDK 与本地 workspace）：只允许 cli/server 消费，浏览器侧包禁止 import",
			severity: "error",
			from: { path: `^(apps/web|apps/console|packages/chat-ui)|${sdkReact}` },
			to: { path: "^packages/eval" },
		},
		{
			name: "browser-no-sdk-runtime-import",
			comment:
				"浏览器产物不得 runtime import @openagentpack/sdk 主入口（Node-only bundle）。只允许 import type，或走 ./session-events 子路径",
			severity: "error",
			from: { path: "^(apps/web|apps/console|packages/(sdk|chat-ui))/src" },
			to: {
				path: "node_modules/@openagentpack/sdk/dist/(index|project-workspace|project-versions|file-lifecycle|scan-lifecycle)\\.js$",
				dependencyTypes: ["npm"],
			},
		},
		{
			name: "no-inner-network-deps",
			comment: "全仓零内网依赖（开源就绪约束，见 ADR-0002）",
			severity: "error",
			from: {},
			to: { path: "node_modules/@ali(fe)?/" },
		},
		{
			name: "antd-console-only",
			comment: "antd 仅限管理端（ADR-0015）：apps/console 之外的源码禁止依赖 antd 与 @ant-design/*",
			severity: "error",
			from: { pathNot: "^apps/console/" },
			to: { path: "node_modules/(antd|@ant-design)/", dependencyTypes: ["npm"] },
		},
		{
			name: "no-orphans",
			comment: "未被子引用的源码文件通常意味着遗漏的 barrel 导出或死代码",
			severity: "warn",
			from: {
				orphan: true,
				pathNot: [
					"\\.(d|test|spec)\\.ts$",
					"(^|/)tests?/",
					"(^|/)fixtures/",
					"(^|/)scripts?/",
					"^scripts/skills/src/[^/]+/examples/", // 独立编译的文档入口，见 docs/architecture.md
					"(^|/)bin/",
					"\\.(config|rc)\\.(c|m)?js$",
					"(^|/)(tsup|vite|vitest).config.ts$",
					sdkPublicSources, // 明确声明的功能子入口由构建直接消费，见 ADR-0026
					"(^|/)apps/storybook/(source\\.config\\.ts|lib/|app/)",
				],
			},
			to: {},
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		tsPreCompilationDeps: true,
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "require", "node", "default", "types"],
			extensions: [".ts", ".tsx", ".js", ".jsx", ".vue", ".json"],
		},
		reporterOptions: { dot: { collapsePattern: "^(node_modules|dist)/+" } },
	},
};
