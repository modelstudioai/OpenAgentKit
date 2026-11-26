import { Inject, Injectable } from "@nestjs/common";
import { MemberUsageService } from "../shared/member-usage.ts";
import { UsageLimitService } from "../shared/usage/usage-limits.ts";
import { TemplateService } from "./catalog/templates.ts";

@Injectable()
export class TemplateUsageService {
	constructor(
		@Inject(TemplateService) private readonly templates: TemplateService,
		@Inject(MemberUsageService) private readonly usage: MemberUsageService,
		@Inject(UsageLimitService) private readonly limits: UsageLimitService,
	) {}

	summary(query: Parameters<MemberUsageService["summaryByTemplate"]>[0]) {
		return this.usage.summaryByTemplate(query);
	}

	async dailyTrend(templateId: string | null, days: number) {
		if (templateId) await this.templates.get(templateId);
		return this.limits.templateDailyTrend(templateId, days);
	}

	async sessions(templateId: string, query: Parameters<MemberUsageService["listByTemplate"]>[1]) {
		await this.templates.get(templateId);
		return this.usage.listByTemplate(templateId, query);
	}

	async limit(templateId: string) {
		await this.templates.get(templateId);
		return this.limits.template(templateId);
	}

	async setLimit(templateId: string, input: Parameters<UsageLimitService["setTemplate"]>[1], subject: string) {
		await this.templates.get(templateId);
		return this.limits.setTemplate(templateId, input, subject);
	}

	async resetLimit(templateId: string, subject: string) {
		await this.templates.get(templateId);
		return this.limits.resetTemplate(templateId, subject);
	}
}
