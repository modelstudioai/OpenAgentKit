# apps/storybook — 文档站

OpenAgentKit 的官方文档站与组件展示站，使用 Next.js + Fumadocs 构建为纯静态产物。
内容以中文为主，代码标识符和上游原文保持原语言。

正式站点：<https://modelstudioai.github.io/OpenAgentKit/>

本文件面向人类读者；MDX 约定、主题、预览与生成链路见 [AGENTS.md](./AGENTS.md)。

## 站点内容

- **落地页**：项目定位、能力概览、组件与设备预览。
- **文档**：快速开始、本地 Demo、核心概念、SDK 接入、组件、Skill 与部署。
- **接口参考**：从 `apps/server/openapi.json` 生成的 `/docs/api/**` 页面。
- **组件预览**：`/previews/*` 直接渲染真实的 `@openagentpack/kit-chat-ui`，不是截图。
- **Skill 文档**：中文 Skill 入口、安装说明、生成参考与可编译示例。
- **静态搜索**：构建时生成搜索索引，部署后无需搜索服务。

## 快速开始

```bash
pnpm install
pnpm dev storybook             # http://localhost:3000
```

或启动完整环境：

```bash
pnpm dev                  # server + web + console + storybook
```

单独构建并静态托管：

```bash
pnpm --filter storybook build
python3 -m http.server 3010 --bind 127.0.0.1 --directory apps/storybook/out
```

`predev` 会先同步 `apps/server/openapi.json` 并打包 Skill 下载资产；`prebuild` 还会
先构建 chat-ui 依赖，因此不要求手工按顺序执行这些步骤。

## GitHub Pages 部署

文档站由 [`.github/workflows/docs.yml`](../../.github/workflows/docs.yml) 自动构建并部署到
GitHub Pages。仓库 Settings → Pages 的 Source 需选择 **GitHub Actions**。

- workflow 在 push 到 `main` 或手动 `workflow_dispatch` 时运行；只有 `main` 会执行部署。
- `actions/configure-pages` 提供页面所属的项目子路径，workflow 将其注入
  `NEXT_PUBLIC_BASE_PATH`；Next 的 `basePath` 与站内路径 helper 据此生成
  `/OpenAgentKit/...` 地址。
- 构建产物 `apps/storybook/out` 由 `actions/upload-pages-artifact` 上传，再由
  `actions/deploy-pages` 发布，不需要提交构建产物或维护 `gh-pages` 分支。
- 使用 Actions 部署时不需要 Jekyll 处理，`_next` 等以下划线开头的目录会原样发布。

本地模拟项目子路径：

```bash
NEXT_PUBLIC_BASE_PATH=/OpenAgentKit pnpm --filter storybook build
mkdir -p .scratch/pages
ln -sfn ../../apps/storybook/out .scratch/pages/OpenAgentKit
python3 -m http.server 3010 --bind 127.0.0.1 --directory .scratch/pages
```

访问 `http://127.0.0.1:3010/OpenAgentKit/`。根路径构建仍可直接托管
`apps/storybook/out`，不要与子路径模拟混淆。

如后续绑定自定义域名，在仓库 **Settings → Pages → Custom domain** 中保存域名，再按域名类型配置 DNS。
部署到域名根路径时，`configure-pages` 返回空的 `base_path`，重新运行部署即可。
[GitHub Pages 自定义域名配置](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## 修改内容

- **新增文档**：在 `content/docs/` 添加 `.mdx`，再到 `content/docs/meta.json` 登记顺序。
- **修改接口**：先 `pnpm gen:openapi` 更新 server 的 OpenAPI，再构建文档站；不要手改
  生成的 `openapi.json` 或 `/docs/api/**` 页面。
- **修改 Skill 示例**：先改 `scripts/skills/src/*/examples/`，再运行 `pnpm gen:skills`；
  `pnpm check:skills` 只检查漂移，不会自动修正。
- **新增组件预览**：在 `components/showcase.tsx` 注册名称，并在 `components/demos/` 添加
  纯客户端 demo。

## 代码结构

```text
app/                 首页、文档页、组件预览、静态搜索路由
content/docs/        中文文档与 meta.json 导航
components/          站点 UI、预览壳、落地页动效与 MDX 展示组件
lib/                 source / MDX / OpenAPI 装配
scripts/             OpenAPI 同步与搜索索引复制
e2e/                 静态站上的组件交互回归
public/              静态资源与构建时复制的 Skill 下载资产
```

## 验证

```bash
pnpm --filter storybook typecheck
pnpm --filter storybook test
pnpm --filter storybook build
pnpm --filter storybook e2e   # 需先静态托管 apps/storybook/out，或设置 DOCS_PREVIEW_URL
pnpm check:docs
pnpm check:skills
```

GitHub Pages 子路径回归：

```bash
NEXT_PUBLIC_BASE_PATH=/OpenAgentKit pnpm --filter storybook build
DOCS_PREVIEW_URL=http://127.0.0.1:3010/OpenAgentKit/ pnpm --filter storybook e2e
```

## 相关文档

- [文档站不变量](./AGENTS.md)
- [架构与依赖方向](../../docs/architecture.md)
- [接口与 op 对照表](../../docs/interfaces.md)
- [贡献指南](../../AGENTS.md)
