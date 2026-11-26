import { KitError } from "@openagentkit/sdk/protocol";
import type { ResourceDraftGateway } from "../../../gateway/types.ts";
import type { DraftResourceActions, DraftResourceService } from "./draft-resources.ts";

/** 一个批次共用动作表和在途请求记录，发布完成后仍可交付本次 Operation ID。 */
export class DraftRuntime {
	readonly actions: DraftResourceActions;
	private readonly inFlight = new Set<Promise<unknown>>();
	private retired?: "published" | "discarded";

	constructor(
		private readonly draftStatus: () => Promise<string | undefined>,
		readonly gateway: ResourceDraftGateway,
		private readonly service: DraftResourceService,
		private readonly assertNotDiscarding: () => void,
	) {
		this.actions = {
			clearTransientState: () => this.clearTransientState(),
			overview: this.action(service.overview),
			declarations: this.action(service.declarations),
			resourceBindings: this.action(service.resourceBindings),
			resolveResourceBindings: this.action(service.resolveResourceBindings),
			agentOptions: this.action(service.agentOptions),
			createAgent: this.action(service.createAgent),
			memoryStoreConfiguration: this.action(service.memoryStoreConfiguration),
			createMemoryStore: this.action(service.createMemoryStore),
			createVault: this.action(service.createVault),
			createEnvironment: this.action(service.createEnvironment),
			declaration: this.action(service.declaration),
			declarationPreview: this.action(service.declarationPreview),
			stageFileUpload: this.action(service.stageFileUpload),
			cancelFileUpload: this.localAction(service.cancelFileUpload),
			previewFileUploads: this.action(service.previewFileUploads),
			commitFileUploads: this.action(service.commitFileUploads),
			stageSkillUpload: this.action(service.stageSkillUpload),
			cancelSkillUpload: this.localAction(service.cancelSkillUpload),
			previewSkillUploads: this.action(service.previewSkillUploads),
			commitSkillUploads: this.action(service.commitSkillUploads),
			declarationPut: this.action(service.declarationPut),
			declarationDelete: this.action(service.declarationDelete),
			validate: this.action(service.validate),
			plan: this.action(service.plan),
			execute: this.action(service.execute, true),
		};
	}

	waitForPending() {
		return Promise.allSettled(this.inFlight);
	}

	clearTransientState() {
		this.service.clearTransientState();
	}

	retire(reason: "published" | "discarded" = "published") {
		this.retired = reason;
		this.clearTransientState();
	}

	private async closed() {
		return this.retired || (await this.draftStatus()) === "published";
	}

	private async assertOpen() {
		if (await this.closed()) throw new KitError("conflict", "此批次已发布并关闭，请创建新的发布批次");
	}

	/** 取消只触碰当前实例的暂存区；批次归属在取得动作前校验，退出或发布会封闭该实例。 */
	private localAction<Args extends unknown[], Result>(method: (...args: Args) => Result) {
		return (...args: Args) => {
			if (this.retired === "discarded") throw new KitError("not_found", "资源发布批次不存在");
			if (this.retired) throw new KitError("conflict", "此批次已发布并关闭，请创建新的发布批次");
			this.assertNotDiscarding();
			return method.apply(this.service, args);
		};
	}

	private action<Args extends unknown[], Result>(method: (...args: Args) => Result, deliverOperation = false) {
		return (...args: Args) => this.run(method, args, deliverOperation);
	}

	private async run<Args extends unknown[], Result>(
		method: (...args: Args) => Result,
		args: Args,
		deliverOperation: boolean,
	): Promise<Awaited<Result>> {
		if (!(await this.draftStatus())) throw new KitError("not_found", "资源发布批次不存在");
		await this.assertOpen();
		this.assertNotDiscarding();
		const result = method.apply(this.service, args);
		if (!(result instanceof Promise)) return await result;
		this.inFlight.add(result);
		try {
			const value = await result;
			if (!deliverOperation) await this.assertOpen();
			return value;
		} finally {
			this.inFlight.delete(result);
			// 暂存可能在批次关闭后才完成，结束时再次释放。
			if (await this.closed()) this.clearTransientState();
		}
	}
}
