import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("kit_usage_limit_agent_days")
export class KitUsageLimitAgentDaysEntity {
	@PrimaryColumn("text")
	declare agent_slug: string;

	@PrimaryColumn("text")
	declare day: string;

	@Column("integer", { default: 0 })
	declare tokens: number;

	@Column("real", { default: 0 })
	declare active_seconds: number;
}
