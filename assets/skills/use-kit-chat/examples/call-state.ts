import { createMutation, createObservable, createQuery, type QuerySnapshot } from "@openagentkit/sdk/state";

interface ResourceView<T> {
	query: QuerySnapshot<T>;
	mutation: { pending: boolean; error: string | null };
	editing: boolean;
}

/** 宿主提供后端调用，SDK 管理可订阅的调用状态。 */
export function bindResource<T, Input>(
	read: (signal: AbortSignal) => Promise<T>,
	write: (input: Input) => Promise<void>,
	render: (view: ResourceView<T>) => void,
) {
	const query = createQuery(read);
	const mutation = createMutation(write);
	const editing = createObservable(false);
	const publish = () =>
		render({ query: query.getSnapshot(), mutation: mutation.getSnapshot(), editing: editing.getSnapshot() });
	const subscriptions = [query.subscribe(publish), mutation.subscribe(publish), editing.subscribe(publish)];
	publish();
	void query.refresh();
	return {
		refresh: query.refresh,
		// 仅在用户显式操作后调用，错误会拒绝，写入禁止自动重试。
		save: mutation.run,
		setEditing: editing.set,
		dispose() {
			for (const unsubscribe of subscriptions) unsubscribe();
			query.dispose();
			mutation.dispose();
		},
	};
}
