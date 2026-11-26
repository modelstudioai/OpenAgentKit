import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("kit_usage_limit_agent_months")
export class KitUsageLimitAgentMonthsEntity {
	@PrimaryColumn("text")
	declare agent_slug: string;

	@PrimaryColumn("text")
	declare month: string;

	@Column("integer", { default: 0 })
	declare tokens: number;

	@Column("real", { default: 0 })
	declare active_seconds: number;

	@Column("integer", { default: 0 })
	declare tokens_unknown: number;

	@Column("integer", { default: 0 })
	declare active_seconds_unknown: number;
}
