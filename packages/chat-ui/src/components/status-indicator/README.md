# StatusIndicator 连接与执行状态

将执行阶段、连接状态和错误组合为文本或紧凑徽标。

- `connected` 和 `turnRunning` 为必填项，`phase` 提供时作为执行阶段。
- `connection` 为 `connecting` 或 `reconnecting` 时覆盖基础状态。有错误时，重连中保留重连提示，其余状态展示错误。

## Props

下表的类型与必填项以当前源码为准；`—` 表示无固定默认值。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `connected` | `boolean` | 是 | — | 是否已建立连接，可传 `chat.connection === "connected"` |
| `turnRunning` | `boolean` | 是 | — | 当前回合是否在生成，可传 `chat.turnRunning` |
| `phase` | `"running" \| "failed" \| "idle" \| "requires_action" \| "stopping" \| "interrupted"` | 否 | — | Turn 阶段，优先于由 `turnRunning` 推导 |
| `connection` | `ConnectionState` | 否 | — | 连接状态，取值为 `disconnected`、`connecting`、`connected` 或 `reconnecting` |
| `error` | `{ code: string; message: string; } \| null` | 否 | — | 流错误，与错误模型同一套 code |
| `variant` | `"default" \| "badge"` | 否 | `"default"` | `badge` 在保留状态文本的同时提供紧凑徽标，适合空间受限的页头 |

## 导出与使用

本目录维护：StatusIndicator。

包方式接入仍使用公开入口：

```tsx
import { StatusIndicator } from "@openagentpack/kit-chat-ui";
```

```bash
pnpm kit:add status-indicator
```

源码入口为 [index.tsx](index.tsx)。copy-in 会保留目录层级并带入 registry 声明的依赖；主题接入见文档站。

同目录测试：[status-indicator.test.tsx](status-indicator.test.tsx)。

组合用法见[状态灯演示](../../../../../apps/storybook/content/docs/components/chrome.mdx#状态灯)。全部组件回归运行 `pnpm --filter @openagentpack/kit-chat-ui test`。
