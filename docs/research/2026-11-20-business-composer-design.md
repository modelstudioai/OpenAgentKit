# 业务输入框组件设计方案

状态：设计对齐中，逐组件拍板。远端原型落码前用户在浏览器确认。
来源讨论：2026-11-20 组件设计会（Figma Solution 设计稿逐节点解析）。

## 背景与输入

新业务场景要基于现有 `@openagentpack/kit-chat-ui`（及 Vue 镜像）开发另一个业务输入框，
相比现有体验页 Sender，底部会新增很多附加能力入口。

设计稿来源（Figma Solution，经 DSL 解析）：

| 节点 | 内容 |
| --- | --- |
| `53:8949` / `53:5910` | Component 197「文本chat · 完整工具栏」：输入框整体（玻璃拟态卡 + 工具栏行 + 底部附加条叠层） |
| `60:2238` | 「添加 · 主菜单」：添加文件 / 技能▸ / MCP▸ / Agent▸，含分组线 |
| `60:2465` | 「技能 · 二级菜单」：技能行（图标+名称+描述）、查看更多 (8)、管理技能（钉底操作区） |

## 组件三原则（全部设计的判据）

1. **协议自定，不耦合业务**：命名与 props 全部中性（形态词），能力语义（知识/记忆/模型/技能）
   全在业务侧组合；Sender 不新增业务回调；组件不设 `type: "option" | "action"` 这类业务语义 prop。
2. **可插拔，业务轻松二开**：四条注入通道每个组件齐备——icon 用 `ReactNode` prop 任意注入；
   组件自有文案走 strings.ts + `strings` 覆盖（业务内容文案走 prop/children，组件词典不含菜单词条）；
   样式走 `className` + 语义 `classNames.*` 槽位 + `data-*` 状态钩子；结构走开放插槽，
   不用枚举 props 配置条目。二开根：组件只消费 CSS 变量 token，copy-in 后改业务主题变量即可换肤。
3. **UI 不必还原设计稿，效果业务自加**：默认视觉只用现有冻结 token（朴素版）；
   设计稿的流光边框/玻璃拟态不进组件，组件保证可加层的稳定锚点
   （根元素为普通 form、无 overflow:hidden 夹层、语义 classNames 覆盖 root），
   业务侧用包装层 + `:focus-within` + 自有 keyframes 实现，零组件改动。

## 总体拆分

```
<Sender variant="workspace">          ← 布局不动：编辑区在上 + 底行左 prefix / 右 suffix
  prefix:  [图标圆钮 添加] [图标圆钮 添加附件]
           [PillButton 知识] [PillButton 记忆] [PillButton 联网搜]
  suffix:  [模型选择器（Menu 组合）] [内置发送钮]
  dock:    [附加条目 ×N]           ← 开放槽位
</Sender>
```

| 项 | 决策 | 状态 |
| --- | --- | --- |
| 工具栏行布局 | 复用现有 `Sender` workspace variant（`packages/chat-ui/src/components/sender/index.tsx`），不新增布局 | 已拍板 |
| 胶囊触发钮 | 新 primitive，**命名 `PillButton`**（形态命名不绑宿主；与未来 `IconButton` 成族；否决 SenderPill/CapabilityButton） | 待定（下一个拍板） |
| 圆形图标钮（32×32） | 不做组件：普通 button + 现有 ACTION 类，业务 6 行组合；复用出现再提 `IconButton` | 已拍板 |
| 底部附加条 | 新增 `Sender.Dock`（对齐 `Sender.Header` 先例）：渲染为 form 的兄弟区域（叠层几何要求 dock 在 form 元素外），组件固定 z 顺序（form 在上）+ 默认间距，业务经 `classNames.dock` 负 margin 实现设计稿「压边叠层」 | 待定 |
| Dock 条目 / 模型选择器 | 不预抽：形态单一且无第二调用方，业务组合现有 chip/Menu；等第二形态出现再提 `DockItem` | 已拍板 |
| 「添加」菜单 | Menu 包装层扩展，见下节 | 已拍板（协议级） |

## 「添加」菜单协议（已拍板）

现有 Menu 包装层（`packages/chat-ui/src/components/menu/index.tsx`）只有
`Menu / MenuTrigger / MenuContent / MenuItem` 四件套。补齐：

### 新增导出（定型薄包装，Radix 能力原样透传）

| 导出 | 职责 | 关键 props |
| --- | --- | --- |
| `MenuSeparator` | 分组线，1px token 分隔 | Radix Separator 透传 |
| `MenuSub` | 二级菜单根 | Radix Sub 透传 |
| `MenuSubTrigger` | 二级触发行 | `icon?` `children` `description?` `trailing?` `chevron?=true` |
| `MenuSubContent` | 二级面板，自动避让翻面 | Radix SubContent 透传 |
| `MenuItem`（扩展） | 菜单行 | `icon?` `children` `description?` `trailing?` `active?` |

### MenuItem 行布局协议

`[icon 16] [children 主文案 grow] [description ellipsis 弱化] [trailing]`，
四段全部可缺席，缺省退化为纯文字行；一个语义一个 prop，不留平行通道。

### 右侧插槽唯一规则（统一 chevron 与选中勾）

- 内置图形只是 `trailing` 缺席时的**默认值**，不是独立元素：
  SubTrigger 缺省渲染 chevron-right；MenuItem 定义 `active` 时缺省渲染选中勾。
- 业务传 `trailing={<MyIcon />}` 即整体接管右侧（换图标、换形态走这一个插槽）；
  `chevron={false}` 用于既不传 trailing 也不要指示。
- 不存在「内置图形与 trailing 同时渲染」的状态。

### 选中态（active）

- `active?: boolean` 是**业务派生的状态输入**：业务从 sender 草稿扫描 `/name ` 标记
  （如 `draftSkills.includes(s.name)`）决定取值，组件不感知 sender；
  草稿删除标记后业务重渲染即回到 false。
- 定义 `active` 后行角色升级为 `menuitemcheckbox` + `aria-checked`；
  内置勾样式经 `[data-active]` CSS 钩子覆盖。

### 分区与键盘

- 「选项区滚动 + 操作区钉底」= 组合（滚动 div + `MenuSeparator`），不引入组件概念；
  设计稿里「管理技能」与普通条目 anatomy 相同，钉底是分区组合的结果。
- 键盘导航、typeahead、Escape、焦点圈由 Radix 提供；键盘导航跨分区不受滚动容器影响。

### 业务侧职责

添加按钮 = `MenuTrigger asChild` + 圆形图标钮；菜单词条（添加文件/技能/MCP/Agent/查看更多/
管理技能）与点击行为全部业务 i18n + 回调；技能数据与 `/` 触发的 Suggestion 共用同一份
数据源，两个入口互不耦合；二级菜单选中技能 = `senderRef.replaceRange(caret, caret, "/name ")`。

## 视觉策略

- 面板默认 kit token（`--kit-radius-sm` 9px、`--kit-shadow` 等）；设计稿的 16px 圆角、
  32px 行高等由业务 className 覆盖。同一份业务组合代码，两种皮都成立。
- 可读性替换：设计稿弱化文字 `#14151C66` / `#14151C99` 对比度低于 4.5:1，
  原型统一取 `#5f656e`（白底达标），落码时同步标注。
- kit token 值出处：`packages/chat-ui/src/theme.css`
  （radius-sm 9px、shadow、bg-subtle `#f6f7fb`、fg `#101322`、fg-muted `#5b6478`）。

## 交互原型

[composer-add-menu-prototype.html](./assets/composer-add-menu-prototype.html)（自包含单文件）：

- 「添加」主菜单 + 技能二级菜单完整交互；技能行点击插入 chip、编辑器退格删除 chip 后
  菜单 active 双向同步（真实 input 事件驱动）；已选行点击 = 移除（业务 toggle 示意）。
- 设计还原态 ↔ kit 默认态皮肤切换（演示原则 3：同一组合两种皮）。
- 交付前 impeccable detect 通过（0 问题）。

## 落码清单（拍板完成后）

1. chat-ui：Menu 四导出 + MenuItem anatomy + `active`；strings 无新增（菜单词条全业务）。
2. chat-ui-vue：ADR-0028 同合同镜像，公开注入点同名插槽；`pnpm gen:chat-ui-vue` 同步主题/文案。
3. registry.json 依赖闭包、`src/index.ts` 公开导出、开发 Skill catalog 同步（`pnpm gen:skills`）。
4. 真实调用方：新业务场景页面；组件不 fetch 业务接口，数据与动作由 SDK hooks 或回调注入。

## 待拍板队列

1. PillButton（知识/记忆/联网搜）：形态协议草案已在讨论中给出
   （`icon?/label/active?/chevron?/classNames` 四段 anatomy），待逐个确认。
2. 添加附件（plug 图标钮）。
3. Sender.Dock（溢出行为：换行 or 横滚未定）。
4. 流光边框/玻璃拟态的业务加层示例文档化。
