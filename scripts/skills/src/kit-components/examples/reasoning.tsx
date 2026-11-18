import { ReasoningBlock } from "@openagentpack/kit-chat-ui";
import { useState } from "react";

// 实际对话中，每个推理分片的状态来自 Provider。
// 下列操作在同一个组件实例上演示各阶段切换。
export function ReasoningLifecycle() {
	const [status, setStatus] = useState<"streaming" | "done" | "failed" | "interrupted">("done");
	return (
		<div className="flex flex-col gap-3" data-kit-appearance="workspace">
			<fieldset className="flex flex-wrap gap-3">
				<legend className="sr-only">推理阶段操作</legend>
				<button type="button" onClick={() => setStatus("streaming")}>
					开始推理
				</button>
				<button type="button" onClick={() => setStatus("done")}>
					完成
				</button>
				<button type="button" onClick={() => setStatus("interrupted")}>
					中断
				</button>
				<button type="button" onClick={() => setStatus("failed")}>
					失败
				</button>
			</fieldset>
			<ReasoningBlock text="先比较证据，再给出回答。" status={status} />
		</div>
	);
}
