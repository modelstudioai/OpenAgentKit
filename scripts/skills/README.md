# scripts/skills — Coding Agent Skill 源与生成器

这里维护面向 coding agent 的中文 Skill。`kit-components`、`use-kit-chat` 和
`kit-chat-provider` 指导对话集成，`kit-database` 指导 Kit Server 数据库接入。
Skill 不参与应用运行时，也不是 npm 包。

本文件面向人类读者；维护不变量见 [AGENTS.md](./AGENTS.md)。

## 源与生成物

只编辑 `src/`：

```text
scripts/skills/src/<name>/
  metadata.json   name、description
  skill.md        SKILL.md 正文
  catalog.json    公开 API 到中文用途、文档与示例的映射
  references/     人工维护的行为说明
  examples/       可编译的 TS/TSX 示例
```

不要手改 `assets/skills/<name>/`。它由 `pnpm gen:skills` 生成，包含：

```text
assets/skills/<name>/
  SKILL.md
  references/api.md
  references/examples.md
  references/...   从 src 复制
  examples/        从 src 复制
```

`assets/skills/dist/` 是离线包产物，已 gitignore。
离线包与文档站下载使用同一份发布文件清单。生成和打包均省略客户端专用的 `agents/openai.yaml`。

## 常用命令

```bash
pnpm gen:skills       # 生成 assets/skills、API 参考和文档示例
pnpm check:skills     # 检查中文说明和产物漂移，不写文件
pnpm typecheck:skills # 编译示例与公开 API fixture
pnpm test:skills      # 生成、链接、打包和浏览器依赖边界
pnpm pack:skills      # 生成 assets/skills/dist/*.tgz
```

文档站的 `skill-example` 代码块与 Skill 示例来自同一份源文件；改示例后必须重新生成。
发布或复制 Skill 时，使用 `assets/skills/<name>/` 或 `assets/skills/dist/<name>.tgz`。

## 新增或修改内容

- 新增公开组件、子组件或 SDK 入口时，先更新 `catalog.json`，再补示例并运行
  `pnpm gen:skills`。
- 修改行为说明时，编辑 `src/<name>/references/`；生成器只复制，不覆盖人工正文。
- 新增 Skill 时在 `src/` 下提供 metadata 和正文。涉及公开 API 时补齐 catalog 与编译示例，
  按需添加参考内容。生成器按目录发现 Skill，文档站导航由 `content/docs/skill/meta.json` 维护。
- 生成、检查和打包都会校验元数据文案、catalog 用途和备注、入口正文以及手写 Markdown 参考是否包含中文。
  示例注释与界面文案在 TS/TSX 源文件中维护。
- API 签名、Props 和类型以公开 TypeScript 导出为准；中文用途与约束以 catalog 和
  references 为准，两者共同校验。

## 相关文档

- [维护规则](./AGENTS.md)
- [文档站 Skill 说明](../../apps/storybook/content/docs/skill/index.mdx)
- [安装与更新](../../apps/storybook/content/docs/skill/install.mdx)
- [目录与放置规则](../../docs/repository-layout.md)
