# scripts/skills — 中文开发 Skill 源与生成器

适用于本目录及其生成链路。先读[根规则](../../AGENTS.md)、
[目录规则](../../docs/repository-layout.md)与 [ADR-0027](../../docs/adr/0027-skills-source-and-generated-output.md)。
这里维护开发期内容，不是 workspace 包，不参与产品运行时。

## 职责与入口

- `src/<name>/metadata.json`、`skill.md`、`catalog.json`、
  `references/`、`examples/`：唯一人工编辑源。
- `generate.mjs`、`api-model.mjs`、`validate.mjs`：抽取公开 API、生成与漂移/内容校验。
- `pack.mjs`、`archive.mjs`：离线包与文档站下载准备；`tests/`：生成链路合同。
- `assets/skills/<name>/`：被跟踪的最终生成目录；`assets/skills/dist/` 为忽略的离线包。
  `apps/storybook/public/skills/` 是构建下载资产，不是第二份人工源。

## 不变量

1. Skill 的入口、参考、元数据、示例注释与界面文案使用中文，保留 Skill ID、文件名、API 标识符和协议值。
2. 最终目录由根命令生成，不手改 `SKILL.md`、OpenAI metadata、API/示例参考、
   示例副本或 MDX 的 `skill-example` 标记区。
3. 每个 Skill 可独立复制；内部相对链接不能越出目录，文件键使用可移植的 `/`。
   离线包保持确定性，构建不修补被跟踪的源文件。
4. `kit-components` 覆盖公开组件、静态子组件和 helper，不以 registry 分组代替 API。
   示例必须实际调用对应组件或函数，类型和必填项来自公开声明。
5. `kit-chat-provider` 负责 Stream/Request 与后端接入说明；
   `use-kit-chat` 负责 Controller 与功能 hooks。模块表、catalog 和实际公开入口同步，
   同一类型经多入口导出时去重，不暴露私有工具。
6. 示例遵循 SDK / UI 边界，不导入上游 SDK 主入口运行时或 internal，不复制状态机或转换器；
   未发布依赖必须明确前提，不能把离线示例描述为真实 Cloud 验证。

## 修改步骤

1. 先改所属公开 API 或 `src/<name>/` 的内容，新增能力同步 catalog 与编译示例。
2. 运行 `pnpm gen:skills`，检查最终目录及 MDX 示例变更，禁止直接修补产物。
3. 新增复杂流程在隔离临时目录前向试用；按适用协作规则使用独立 agent，
   以试用结果改进说明，不引入产品运行时依赖。

## 验收

```bash
pnpm check:skills
pnpm typecheck:skills
pnpm test:skills
pnpm check:docs
```

需要交付离线包时执行 `pnpm pack:skills`。只改本文件且未变更 Skill 源或生成器时，
按根文档验证规则执行；源码、示例与生成算法变化选择相应漂移、链接、打包和浏览器边界回归。
