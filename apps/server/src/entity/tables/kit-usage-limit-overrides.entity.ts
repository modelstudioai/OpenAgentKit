import { Column, Entity } from "typeorm";

@Entity("kit_usage_limit_overrides")
export class KitUsageLimitOverridesEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare member_id: string | null;

	@Column("integer", { nullable: true })
	declare monthly_tokens: number | null;

	@Column("real", { nullable: true })
	declare monthly_active_seconds: number | null;

	@Column("text")
	declare updated_at: string;

	@Column("text")
	declare updated_by: string;

	@Column("integer", { nullable: true })
	declare daily_tokens: number | null;

	@Column("real", { nullable: true })
	declare daily_active_seconds: number | null;
}
