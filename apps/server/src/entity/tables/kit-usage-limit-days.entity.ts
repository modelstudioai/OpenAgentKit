import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("kit_usage_limit_days")
export class KitUsageLimitDaysEntity {
	@PrimaryColumn("text")
	declare member_id: string;

	@PrimaryColumn("text")
	declare day: string;

	@Column("integer", { default: 0 })
	declare tokens: number;

	@Column("real", { default: 0 })
	declare active_seconds: number;
}
