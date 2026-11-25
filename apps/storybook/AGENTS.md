# apps/storybook — 文档站与组件预览

适用于本目录。先读[根规则](../../AGENTS.md)、[架构](../../docs/architecture.md)、
[目录规则](../../docs/repository-layout.md)及[开发 Skill 规则](../../scripts/skills/AGENTS.md)。
框架和依赖版本以本包 package.json、lockfile 与已安装文档为准。

## 职责与入口

- `content/docs/`：中文使用文档与 MDX；`meta.json` 管导航。
- `source.config.ts`、`lib/source.ts`、`lib/mdx-components.tsx`：MDX 加载、目录及组件映射。
- `lib/openapi.ts`、`scripts/sync-openapi.mjs`：从服务端 spec 生成接口文档输入。
- `components/`、`app/previews/`：真实组件预览、设备视口及站点交互。
- `app/globals.css`：站点视觉与 `--kd-*` token。
- `.source/`、`.next/`、`out/`、本包 `openapi.json` 与 `public/skills/`：生成物，不手改。

## 不变量

1. 命令、包名、导入入口与页面说明必须对应当前实现。页数、依赖版本和发布拓扑
   以实际配置为准。
2. 站内说明、Skill 正文、API 参考及嵌入示例文案使用中文，遵循 ADR-0027 的状态更新。
   用户文档不得把私有 workspace 包描述为已经发布到 npm。
3. 使用本地资源，不引外部字体/CDN、内网包或内网地址，静态下载保持离线可用。
4. MDX 通过 `source.config.ts → .source/server.ts → lib/source.ts` 装配；
   自定义 MDX 组件在 `lib/mdx-components.tsx` 注册并显式传给渲染器。
   import 保持相对路径和显式扩展名，不引入未经依赖检查支持的别名。
5. 保持 `output: "export"` 和 `trailingSlash`；页面及预览路径必须可静态生成。
   交互放客户端组件，不依赖运行时服务端动作。框架配置修改先查已安装版本文档。
6. 预览使用真实 kit-chat-ui。保留 theme 导入及 chat-ui 源码 `@source`；
   iframe 自己的视口决定断点，设备切换不替换业务实现或无故重挂载。
   涉及浏览器视口的演示在适用时禁用 SSR，保留根主题、Portal 与焦点作用域。
7. 站点样式归 `globals.css` 的 `--kd-*` token，不能覆盖组件库的 `--kit-*` 定义。
   新图标复用 `components/icons.tsx` 的 SVG 族；动效遵循 reduced-motion、离屏和隐藏暂停。
8. 首页暗色、文档页亮色的路由主题由既有初始化脚本与 `route-theme.tsx` 维护；
   不另加相互冲突的主题状态。搜索使用静态索引，预览禁用父站搜索，不能删除索引生成/复制步骤。
9. OpenAPI 来自服务端 spec；下载 Skill 来自根 `assets/skills/` 及离线包。
   构建先检查漂移，不在构建时修补被跟踪的源文件。
10. `skill-example` 标记区与中文参考从 Skill 唯一源生成。示例只使用公开 API，
    不复制协议映射、会话状态机或私有生命周期实现。
11. GitHub Pages 发布注入 `NEXT_PUBLIC_BASE_PATH` 作为 Next 的 `basePath`。站内导航使用 `next/link`。
    iframe、原生静态文件链接和 MDX 图片使用 `withBasePath()`。路由判断使用 `stripBasePath()`。

## 修改步骤

1. 先修改内容所属的权威文档、公开 API 或 Skill 源，再更新 MDX 与导航。
2. 新页面登记 `meta.json`；新预览复用 Showcase、真实组件与设备壳。
3. 接口变化先运行根 `pnpm gen:openapi`；Skill 变化运行 `pnpm gen:skills`，
   不直接编辑生成输入或标记区。
4. 检查链接、搜索、主题、键盘操作与窄屏效果；只对改变的交互选择浏览器回归。

## 验收

```bash
pnpm --filter storybook typecheck
pnpm --filter storybook test
pnpm check:docs
pnpm --filter storybook build
```

首次安装缺少生成输入时，按验收文档的文档站准备步骤生成，不手写占位文件。
内容/交互变更构建后静态托管 `out/` 并运行相关 `pnpm --filter storybook e2e` 用例；
`DOCS_PREVIEW_URL` 可指定静态站点。只改 AGENTS.md 的文字按根规则验证，
无需重跑所有页面的视觉验收。
新增站内根路径 URL 时按 [文档站部署说明](./README.md#github-pages-部署) 验证子路径构建与对应的端到端用例。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
