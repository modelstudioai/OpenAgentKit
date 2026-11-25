# React → Vue API 对照

只列本仓库实际出现的写法。示例保持最小，不引入新依赖。

## Props 与默认值

```tsx
// React
interface ChatProps {
	messages: ChatMessage[];
	turnRunning?: boolean;
	empty?: ReactNode;
}
function Chat({ messages, turnRunning = false, empty }: ChatProps) {}
```

```vue
<!-- Vue -->
<script setup lang="ts">
interface Props {
	messages: ChatMessage[];
	turnRunning?: boolean;
}
const props = withDefaults(defineProps<Props>(), { turnRunning: false });
</script>

<template>
	<div>
		<slot name="empty" />
		<MessageList :messages="props.messages" />
	</div>
</template>
```

要点：

- 默认值放 `withDefaults`，模板里不要再写一遍。
- 优先保留 `props.x` 访问；直接解构会丢失响应性。

## 回调与事件

```tsx
// React
onSend?: (text: string, skills?: string[]) => void | Promise<void>;
```

```vue
<!-- Vue -->
<script setup lang="ts">
const emit = defineEmits<{ send: [text: string, skills?: string[]] }>();
</script>
```

选择规则：

- 宿主事件用 `emit`（`send`、`stop`、`select`）。
- 需要保持引用稳定、透传给第三方组件，或语义上是“配置而非事件”的，保留同名 prop。
- 不要在 Vue 侧同时提供 `onSend` prop 和 `send` emit，二选一。

## 插槽映射

| React | Vue |
| --- | --- |
| `children` | 默认插槽 `<slot />` |
| `empty?: ReactNode` | `<slot name="empty" />` |
| `approvals?: ReactNode` | `<slot name="approvals" />` |
| `leading?: ReactNode` | `<slot name="leading" />` |
| `components?: { SendButton?: ComponentType<P> }` | `<slot name="send-button" v-bind="slotProps" />` |

覆盖型插槽要把 React 传给自定义组件的 props 原样作为 slot props 暴露，
例如 `disabled`、`loading`、`onClick`。事件在 Vue 侧可用同名 emit 或回调 prop，
同一个组件内保持一致。

## 命令式 API

```tsx
// React
useImperativeHandle(ref, () => ({ focus, clear, submit }));
```

```ts
// Vue
defineExpose({ focus, clear, submit });
```

方法名与语义必须一致；Vue 侧通过模板 ref 调用 `ref.value?.focus()`。

## Context

```tsx
// React
const KitLocaleContext = createContext<KitLocale>("zh-CN");
useContext(KitLocaleContext);
```

```ts
// Vue
const kitLocaleKey = Symbol("kit-locale") as InjectionKey<Ref<KitLocale>>;
provide(kitLocaleKey, locale);
const locale = inject(kitLocaleKey, ref("zh-CN"));
```

默认值必须是“未 provide 时的行为”，与 React 的 `createContext` 默认值一致。

## 外部订阅

```ts
// React
const snapshot = useSyncExternalStore(
	controller.subscribe,
	controller.getSnapshot,
	controller.getSnapshot,
);
```

```ts
// Vue
const snapshot = shallowRef(controller.getSnapshot());
const stop = controller.subscribe(() => {
	snapshot.value = controller.getSnapshot();
});
onScopeDispose(stop);
```

`shallowRef` 足够：快照每次都是新对象，不需要深层响应式。

## 派生值与副作用

| React | Vue |
| --- | --- |
| `useMemo(fn, deps)` | `computed(fn)` |
| `useCallback(fn, deps)` | 普通函数；需要稳定引用时用 `shallowRef` 保存 |
| `useEffect(fn, deps)` | `watch(source, fn, { immediate: true })` 或 `watchEffect` |
| `useEffect` cleanup | `watch` 返回的 stop，或 `onScopeDispose` |
| `useLayoutEffect` | `onMounted` + `watch(..., { flush: "post" })` |

注意：Vue 的 `watch` 默认在组件更新前触发；依赖“DOM 已更新”的逻辑必须用
`flush: "post"`，或者在 `await nextTick()` 之后执行。

## 引用与 DOM

| React | Vue |
| --- | --- |
| `useRef<HTMLDivElement>(null)` + `ref={}` | `const el = ref<HTMLDivElement \| null>(null)` + `ref="el"` |
| `useId()` | `useId()`（Vue 3.5+） |
| `createPortal(node, document.body)` | `<Teleport to="body">` |
| `onInput` | `@input` |
| `onCompositionStart/End` | `@compositionstart` / `@compositionend` |

contenteditable 组件不要用 `v-model`：保留 React 版的“外部值 + 命令式写回 + 选区恢复”
结构，否则 IME 与 chip 行为会退化。

## 测试

| React | Vue |
| --- | --- |
| `renderToStaticMarkup(<X />)` | `@vue/server-renderer` 的 `renderToString` |
| `createRoot` + `act` | `@vue/test-utils` 的 `mount` |
| Testing Library 查询 | `getByRole` / `getByLabelText` 等价查询 |

## 逐组件检查模板

复制到 PR 描述，逐项勾选：

```markdown
- [ ] testid 与 React 版一致：<列出>
- [ ] role / 可访问名一致：<列出>
- [ ] aria-* 一致：<列出>
- [ ] 表单元素类型一致
- [ ] 语义类名一致
- [ ] 键盘与焦点行为一致
- [ ] reduced-motion 降级
- [ ] 稳定 ID key
- [ ] 无新增业务请求
- [ ] 单测断言与 React 版对称
- [ ] 共享 E2E 通过
```
