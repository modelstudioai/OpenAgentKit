import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("kit_usage_limit_months")
export class KitUsageLimitMonthsEntity {
	@PrimaryColumn("text")
	declare member_id: string;

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
