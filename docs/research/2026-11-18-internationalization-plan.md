# 后台（Console）与员工端（Web）国际化方案（提案）

> 状态：提案 / 研究文档，未构成 ADR；批准语言机制选型后应沉淀为 ADR 并同步架构文档。
> 范围：`apps/console`（后台管理端）、`apps/web`（员工体验页）、`packages/chat-ui`（两端共用的 copy-in 组件）。
> 不在本轮：`apps/storybook` 文档站内容翻译（按根 AGENTS.md「对外发布时补英文版」另行处理）；会话正文与 Provider 内容翻译。

## 1. 目标

1. 默认 zh-CN，新增 en；两端 UI 静态文案全部可切换，切换即时生效、无需刷新。
2. 建立可扩展的文案组织与键名规范，后续加语种只增词表文件，不改架构。
3. 服务端协议保持稳定：错误以 `code` 为合同，不在服务端下发语言包。
4. 不违反现有红线：SDK 无 UI 文案、web 不引入 antd、chat-ui 不新增设计常量。

## 2. 现状盘点（基于 origin/main）

| 位置 | 现状 | 规模（引号内中文字符串，近似值） |
| --- | --- | --- |
| `apps/console/src` | antd v6 `ConfigProvider locale={zhCN}` 写死于 `app.tsx`；dayjs；Less modules；文案分散在各 feature | 约 1373 处 |
| `apps/web/src` | 静态 CSR + chat-ui；`lib/beijing-time.ts` 写死 `Intl.DateTimeFormat("zh-CN")`；`format-token-count.ts` 写死 en-US compact | 约 162 处 |
| `packages/chat-ui/src` | 无任何 i18n 机制；`message` 时间戳为「拍板格式，显式拼接不随宿主 locale 漂移」；copy-in 分发 | 约 740 处 |
| `apps/server` | 错误体 `{ code, message, retryable }`（`docs/protocol.md`），`message` 为中文开发向文本，例如 `Logo 不存在` | 不翻译 |
| `packages/sdk/src/protocol` | zod `ctx.addIssue` 存在中文 `message` | 展示层归前端映射 |

`pnpm-lock.yaml` 目前无任何 i18n 库依赖。

## 3. 选型

### 3.1 App 层（web + console）：react-i18next

- 依赖：`i18next` + `react-i18next`，仅装在 `apps/web`、`apps/console` 两个包。
- 理由：复数走 `Intl.PluralRules`、插值成熟、命名空间按需加载、typed resources 可由 zh-CN 词表推导键类型；团队免学习成本。
- 备选与否决：
  - 自研 ~100 行 `t()`：贴合仓库自研风格，但复数/插值/工具链（未译扫描、键对齐）要自建，得不偿失。
  - lingui / formatjs：ICU 严格但需要 extract 宏与构建插件，改动面大于收益。

### 3.2 chat-ui：自带轻量词典（copy-in 兼容是硬约束）

copy-in 目标项目不装我们的依赖树，不能把 i18next 塞进组件源码。方案：

- `packages/chat-ui/src/i18n/`：`locale.ts`（`KitLocale = "zh-CN" | "en"`，context + provider）与 `strings/`（每组件一个词典模块，zh-CN 内置默认，en 覆盖表）。
- 组件内部统一 `useKitStrings()` 取文案；组件 props 保留可选 `strings` 覆盖项，供 copy-in 用户自定义措辞。
- `registry.json`：为含词典的组件在 `deps` 闭包中加入 `i18n` 模块条目，`pnpm kit:add` 自动把对应 `strings.ts` 一并复制（`scripts/kit/copy-in.mjs` 需支持多文件条目，registry `version` bump）。
- web / console 侧由一个桥接 provider 把自己的 locale 传入 `ChatUILocaleProvider`，保证三处语言一致。

### 3.3 语言集合与命名

- 首发 `zh-CN`、`en`；locale code 一律 BCP 47。
- 架构对扩展友好：新增语种 = 新词表目录 + 检测映射，不预留第三语种实现。

## 4. 语言解析与持久化

1. 解析优先级：用户显式选择（`localStorage`，如 `kit.locale`）> URL `?lang=`（e2e 与分享链接用）> `navigator.language` 前缀映射 > 默认 `zh-CN`。
2. 切换时同步 `document.documentElement.lang`；不做按语种路由/子域名（SPA 场景无 SEO 需求）。
3. 员工端入口：侧栏或顶栏下拉（复用既有 menu/tooltip 组件）；后台入口：登录页与顶栏各一处。
4. 「记住服务端用户语言偏好」**本阶段不做**：需要新后端 op 才能持久化到账号，属预建；出现真实需求再立项并同步 `docs/interfaces.md`。

## 5. 目录结构与键名规范

```
apps/<web|console>/src/i18n/
  index.ts               # bootstrap：实例创建、语言解析、类型导出
  locales/
    zh-CN/<namespace>.ts # 唯一事实来源（source of truth）
    en/<namespace>.ts    # 必须与 zh-CN 键完全对齐
```

- namespace 与 feature 目录一一对应：web 的 `chat / plaza / usage / new-chat / layout / auth`，console 的 `templates / members / usage / operations / branding / eval / navigation / auth / catalog / preset-packs`。
- 键名 `lowerCamelCase` 语义命名（`plaza.emptyTitle`、`templates.publishConfirm`）；禁止用数组下标或中文原文作键。
- 词表用 TS 文件（可导出注释性术语说明、可复用小片段），不引入 JSON 双轨。
- 插值统一 `{{count}}` 风格；复数用 `_one` / `_other` 后缀。拼接句式的中文一律改写为插值模板。

## 6. 服务端与协议处理

- HTTP 错误体保持 `{ code, message, retryable }`：`code` 是合同，前端按 `code` 映射用户可读文案，`message` 仅作开发向兜底直接展示在细节区。
- 某错误确需带参数展示（如「Logo 不能超过 {{max}}KB」）时，为 error 体追加结构化字段（如 `params`）——属协议变更，逐次立项并同步 `docs/protocol.md`，不一次性铺开。
- SDK protocol 层 zod 中文 message：展示文案由前端按 issue `path` + `code` 映射；SDK 本身不加语言参数（红线：protocol 不引 React/DOM；语言状态属宿主 UI）。
- 计量与业务键不受影响：聚合日键、`session-usage` 等服务端语义不动；Provider 事件、消息正文不翻译、不入库为文案。

## 7. 数字 / 时间格式决策

| 场景 | 决策 |
| --- | --- |
| 消息时间戳（chat-ui `message`） | 维持拍板格式 `yyyy-mm-dd HH:mm`，显式拼接，不随 locale 漂移 |
| 用量数据时间（`beijing-time.ts`） | 继续固定 `Asia/Shanghai`（计量锚点），仅「北京时区」标签词翻译；locale 数字保持 ASCII |
| Token 计数 | 维持 en-US 千进制 K/M/B/T 拍板规则（跨端一致，计量展示约定） |
| 其余纯展示日期 | 统一 `yyyy-MM-dd HH:mm` 不变体，只翻译标签词——避免为 locale 日期变体引入 Intl 分支与测试成本 |

即：**本轮只本地化“标签与句式”，不动“数字与时区拍板”**。若产品后续要求日期本地化格式，另立提案。

## 8. 迁移流程（阶段）

- 阶段 0 基础设施（约 1 天）：两 app 装依赖、`i18n/index.ts` bootstrap、语言切换器、`<html lang>`、`scripts/check-i18n.mjs`（键对齐 + 类型检查）挂入 `pnpm gate` 与 `verify:push`。
- 阶段 1 chat-ui（约 2–3 天）：`i18n` 模块 + provider + registry/copy-in 多文件支持；按组件迁移约 740 处；先迁 web/console 都会用到的 chat / message / session-list / sender。
- 阶段 2 员工端 web（约 1–2 天）：162 处 + 与 chat-ui 桥接；e2e 增加 `?lang=en` 冒烟。
- 阶段 3 后台 console（约 4–6 天，按 feature 渐进）：templates → members/usage → operations/branding/eval → navigation/auth；`ConfigProvider locale` 由 `zhCN/enUS` 随语言切换，`dayjs.locale` 同步。
- 提取方式：人工逐页迁移 + `rg` 扫描兜底；不写 codemod（JSX 嵌套与插值复杂度使成本高于收益）。
- 防回退：增加 `scripts/check-i18n-hardcoded.mjs`（diff 模式，仅对新增/修改的生产源码报告硬编码中文），随 `lint:changed` 类钩子运行，避免存量清零前的误报。
- 术语表：迁移开始时先冻结 glossary（会话/模版/上架/下架/用量/额度/确认 等高频词），存于 `docs/research/i18n-glossary.md`，en 词表统一引用，防止同词多译。

## 9. 验证与门禁（风险驱动）

本改动保护的合同是「UI 文案完整性与三处（web/console/chat-ui）语言一致性」，最少代表性用例：

1. `check:i18n`：zh-CN/en 键集合对齐（缺失即失败）、未被引用的键告警。
2. bootstrap 单测：语言解析优先级（localStorage > URL > navigator > 默认）。
3. web Playwright：`?lang=en` 跑既有主流程冒烟（登录 → 新建会话 → 发送）。
4. console：vitest 覆盖 ConfigProvider locale 切换的渲染冒烟即可，不逐组件加测。
5. 可选调试开关：`?lang=pseudo` 输出膨胀伪翻译，肉眼扫漏。

不为类型保证、简单透传增加重复测试；存量中文清零不靠逐条断言而靠 rg 扫描 + 增量守卫。

## 10. 风险与开放问题

1. **copy-in 兼容**：chat-ui 词典模块必须进入组件依赖闭包，否则外部项目复制后编译失败；registry `version` bump 并在升级 diff 指引中说明。
2. **协议字段追加**（error `params`）需同步 `docs/protocol.md` 并与 SDK 类型生成一致（`pnpm gen:openapi`），只在真实需要时逐次做。
3. **antd v6 locale 覆盖面**：ConfigProvider 换 locale 后 DatePicker/Table/Pagination 自动跟随；但 Less/自绘控件里的中文必须走词典。
4. **en 译文质量**：先占位后统一翻译；发布 en 前需一次母语者审校，否则宁缺毋滥（默认仍 zh-CN）。
5. **决策沉淀**：「App 用 react-i18next + chat-ui 自带词典」应写 ADR（双机制并存的理由：copy-in 硬约束），批准后再动 `docs/architecture.md` 依赖边界。

## 11. 红线自查

- antd 仍只在 `apps/console`；web 复用 chat-ui Primitive，不新增平行组件。
- `packages/sdk` 不引入 React/DOM/语言状态；`src/protocol` 不出现 UI 文案。
- 不新增后端 op、不预建用户偏好持久化；语言包不进 SQLite、不进仓库外服务。
- chat-ui 不新增设计常量/keyframes；文案词典是数据不是视觉 token。
- 动态文案插值使用 SDK 稳定 ID 的规则不受影响（键为静态语义名）。

## 落地记录

### 2026-11-18 阶段 0（分支 codex/i18n）

- 依赖：`i18next@27` + `react-i18next@18` 仅装入 `apps/web`、`apps/console`；chat-ui / SDK 不动。
- 每个 app 落地 `src/i18n/{index.ts,locales/{zh-CN,en}/common.ts}` 与 `locale.test.ts`；
  语言解析为纯函数 `resolveLocale(env)`（存储 > `?lang=` > navigator > 默认 zh-CN），无 DOM 也可测。
- 切换器形态与方案 §4.3 的偏差：两种语言直接用分段控件常驻展示（web 侧栏页脚、console 顶栏与登录页），
  比下拉少一层弹层；引入第三语种时再评估下拉。
- console `ConfigProvider locale` 与 `dayjs.locale` 随语言切换；两端 `<html lang>` 在 init/setLocale 更新。
- 新增 `scripts/check-i18n.mjs`：zh-CN ⇄ en 命名空间与键双向对齐（失败），未引用键告警（不阻断）；
  `pnpm check:i18n` 已挂入 `gate` 与 `verify:push`，根 AGENTS.md 命令块同步。
- 未包含：chat-ui 词典、业务存量文案迁移、server error `params`、账号级语言偏好持久化（后续阶段）。

### 2026-11-18 阶段 1（打样）：chat-ui 词典机制 + sender 迁移

- `components/kit-i18n/`：`KitLocale` 类型、`KitLocaleProvider`（函数组件，避免 context 对象暴露
  `.Provider/.Consumer` 触发 Skill 目录覆盖检查）、`useKitLocale`、纯函数 `resolveStrings`、`useKitStrings`。
- 词典形态：组件同目录 `strings.ts`，default 导出 `{ "zh-CN": T, en: T }`；
  `Sender` 新增公共 prop `strings?: Partial<SenderStrings>`，经 `SenderContext` 下发到按钮/占位符/aria 标签。
- copy-in：registry 条目新增 `extraFiles`（词典）与 `deps: ["kit-i18n"]`；
  `copy-in.mjs/componentSourceFiles`、`add-component.mjs` 与闭包导入断言同步。
- `check:i18n` 扩展 chat-ui 模式：递归找 `components/**/strings.ts`，校验默认导出形态与 zh/en 键对齐。
- 双端桥接：web `ChatUILocaleBridge` 包裹根渲染；console 在 `ConfigProvider` 内包 `KitLocaleProvider`，
  与 antd/dayjs 共用同一语言来源。
- 文档与 Skill：`docs/components/general/i18n.mdx` + meta 导航；
  kit-components catalog 登记 4 个新公开导出（Skill 生成器要求 helper 在示例中有真实调用，补
  `examples/locale-provider.tsx` / `examples/custom-strings.tsx`）；`pnpm gen:skills` 已同步产物。
- 其余组件（约 700 处）按同一形态批量迁移，属阶段 1 后续批次；message 时间戳拍板格式不变。

#### 批次进度（2026-11-18）

| 批次 | 组件 | 可见串数 |
| --- | --- | --- |
| 打样 | sender | 8 |
| 批次 1 | actions、message、message-list、processing-indicator、status-indicator | 约 25 |
| 批次 2a | error-state、message-skeleton、confirm-dialog、meter-bar、category-tabs、markdown、activity-heatmap | 约 20 |
| 批次 2b | file-card、session-list、plaza-card | 约 27 |
| 批次 3 | session-sidebar、sub-agent-card、sub-agent-panel、tool-approval-card、tool-approval-group | 约 70 |
| 批次 4 | attachments、code-highlighter、mermaid、chat、layout、thread-panel、suggestion、tool-call-card、tool-summary、reasoning-block、execution-group、agent-header、message-anchor-rail | 约 45 |

**chat-ui 全部组件文案已清零**（`rg '\p{Han}' components -g '!*strings.ts' -g '!*.test.*'` 仅剩注释；
`deriveAnchorTurns`/`toolSummary` 纯函数以 `strings` 缺省参数保持向后兼容）。共计 **34 份组件词典**。

批次 3 补充形态：深层子树组件（session-sidebar）用内部 context 下传解析结果；
sub-agent-card 家族用显式 strings prop 链（ThreadEventStates 同时被面板复用，locale 经全局 Provider 生效）。
教训：registry.json 尾逗号只有 `scripts/kit` 测试会抓——改 registry 后必须跑 `node --test scripts/kit`。

批次 2 附带：`kit-i18n` 新增 `format(template, values)` 轻量插值（公开名 `formatKitStrings`，已登记 Skill 目录）；
`relativeUsedLabel(iso, strings, now?)` 公开签名加入词典参数（非根入口导出，无 Skill 目录影响）。
遗留协议词汇：`PLAZA_CATEGORY_LABELS`（SDK protocol 中的中文兜底名）与 web 广场标题共用，
属 §6「错误/枚举词表映射」议题，与 server error `params` 一起另行立项，不在组件词典批次内私改 SDK。

待迁清单以 `rg --pcre2 '"[^"]*\p{Han}' packages/chat-ui/src/components -g '!*strings.ts' -g '!*.test.*'` 为准；
每个组件按 sender 形态迁移后由 `check:i18n` 自动纳管，无需改脚本。

### 2026-11-18 阶段 2（部分）：员工端 web 业务文案

- 命名空间：`common`（新增 appTitle/loading/bootstrapFailed）、`auth`、`layout`、`chat`、`plaza`；
  typed resources 收敛为 `AppNamespaces`，`<html lang>` 与浏览器标签页标题随语言更新。
- 已迁文件：main.tsx、member-auth-gate、member-login-form、experience-layout、session-sidebar、
  app.tsx（含 SessionActionDialog/chatHeaderTitle/stagedAttachmentItems 纯函数注入 `t`）、
  experience-sender、aside-panel、new-chat-view、plaza-view。
- 跨命名空间键（如 `t("common:loading")`）需要 `useTranslation(["chat", "common"])` 元组形式才能通过类型检查。
- 待办（下一批）：`features/usage/*`（usage-view、member-usage-limits、apply-credits-dialog、
  quota-banner、year-heatmap 约 35 串）；`lib/kit.ts`、`lib/chat-backend.ts`、`member-session-storage.ts`
  的 KitError 文本按方案 §6 保留为开发向信息，UI 展示层后续按 code 映射。
- web e2e `?lang=en` 冒烟在 usage 批次完成后补。

#### 阶段 2 收尾（同日）

- `features/usage/*`（usage-view、member-usage-limits、apply-credits-dialog、quota-banner、year-heatmap）
  已全部迁入 `usage` 命名空间；web 业务可见中文清零（`lib/*` 的 KitError 开发向文本按 §6 保留）。
- 结构处理：`activityRange(rows, t)` 纯函数注入 t；热力图月份轴用 `monthSuffix` 键（zh「月」/en 空）；
  配额横幅因保留行内 `title` 徽标拆为 `exceededPrefix/exceededSuffix` 两个插值键。
- 新增 `e2e/locale.experience.spec.ts`：`?lang=en` 直达断言 `<html lang>`、英文搜索框/导航与
  chat-ui 输入框英文占位；第二条断言「用户显式选择优先于 URL」的持久化语义。
  本机 8787 被开发中 server 占用，本轮未执行；端口空闲时 `pnpm e2e` 即可跑。

### 2026-11-19 阶段 3（console）启动

| feature | 引号内串数 | 状态 |
| --- | --- | --- |
| templates | 661 | 待迁（最大块，后续分批） |
| usage | 138 | ✅ 全部（限额链路、Session 用量页、趋势卡、模版用量详情与 Provider 遥测表；聚合行名称参数化） |
| members | 88 | ✅ 全部（列表/用量页/遥测表/创建页/hook 错误兜底；共享指标与采集状态词表入 common） |
| preset-packs | 83 | 🔶 智能体选择页已迁；资源详情抽屉与会话资源页待迁 |
| catalog / navigation / operations | 18 × 3 | navigation ✅、operations ✅；catalog 待迁 |
| branding | 15 | ✅ |
| lib / root / auth | 6 / 8 / 4 | auth ✅，其余待迁 |

- console 首批：`navigation`（外壳导航/品牌/抽屉）+ `auth`（登录页）命名空间；
  NAV_GROUPS 改为 `NavigationKey` 字面量键表，渲染时 `t(key)`；`ConfigProvider` 联动阶段 0 已就绪。
- 修正：console 的 `declare module "i18next"` 曾把 `resources` 指向 locale 层级（`I18nResources`），
  应为 `I18nResources["zh-CN"]`；web 同问题此前已修。
- 遗留：`inner-layout` 的 `backLabel` 默认值「返回」随其调用页面迁移（模板批次）一并处理。
- 下一批建议：members + usage（226 串，业务闭环最完整），随后 preset-packs / operations / catalog / branding，
  最后 templates（661 串分 2–3 批）。

#### members 收尾备注（2026-11-19）

- `member-usage-page` 的模型/工具遥测列与 `template-usage-panel` 的会话明细列从模块级常量改为 `columns(t)` 工厂；
  `captureTime` 纯函数注入 `t`；跨命名空间键用 `t(key, { ns: "common" })`。
- 残留风险：创建成员表单的字段校验消息来自 SDK `CreateMemberRequestSchema`（zod 中文 message），
  属 §6「协议错误/枚举词表映射」议题；migrate 后 en 界面会出现中文校验提示，需随 §6 一并处理。
