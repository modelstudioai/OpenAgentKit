# ADR-0030：chat-ui 以 npm 整包发布

## 背景

ADR-0005 确立 chat-ui 以 copy-in registry 形态复制源码。业务侧 Solution 将基于 chat-ui
组件搭建产品并按主题换肤，需要比 copy-in 手工同步更强的版本锚点。包体此前
`private: true`，`publishConfig` 已按公共 npm 配置但从未发布。

## 决策

1. `@openagentpack/kit-chat-ui` 以单包整包发布到公共 npm：解除 `private: true`，
   语义化版本 + changelog，消费方固定版本号升级。
2. 不按组件拆多包：组件共享 theme.css token、kit-i18n 词典与依赖闭包，拆包会复制
   主题与词典依赖声明、放大发版矩阵，且目前没有按组件挑选的消费需求。
3. 发布前完成零 SDK runtime 依赖改造：`skillInputTokens`、`SKILL_INPUT_PREFIX` 与
   `useIsMobile` 三个运行时点不再从 `@openagentkit/sdk` runtime 导入（移入 chat-ui
   或组件本地实现），SDK 依赖降为 type-only；消费方不为两个常量和一个 hook 安装
   整个数据层 SDK。
4. copy-in registry（ADR-0005）保留，两种消费形态并存；registry 闭包随之不再声明
   SDK npm 依赖。

## 理由

- 单包 = 单一版本号锚点，业务侧人工对齐成本最低；组件集按产品形态整体设计，不是工具箱。
- npm 的 semver 给业务侧强制升级路径，比 copy-in 的人肉同步可靠。
- 零 SDK runtime 依赖让包自包含：Kit SDK 数据层绑定 Kit server 协议，业务侧数据面
  直连塞尔达，不该被它拖累。

## 后果

- 公共 npm 发布后，公开导出、props 类型与 theme.css 成为对外合同，破坏性变更需 major。
- 协议 token 常量归属从 SDK 让步到 UI 包，属有意为之；协议演进时两侧同步。
- copy-in 与 npm 双形态并存要求 registry 与包导出同步维护，纳入 `check:docs` 检查范围。
- `useIsMobile` 若 SDK 侧仍有其它调用方则双处并存，以测试防行为漂移。

## 备选方案

- **按组件多包**：仅当出现「消费方只挑部分组件且独立演进」的真实需求时再考虑。
- **维持 copy-in 单形态**：业务侧持有源码可自由改造，但版本漂移只能靠人工比对。
