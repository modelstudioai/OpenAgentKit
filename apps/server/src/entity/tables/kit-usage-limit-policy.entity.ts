import { Check, Column, Entity } from "typeorm";

@Entity("kit_usage_limit_policy")
@Check("id = 1")
export class KitUsageLimitPolicyEntity {
	@Column({ type: "integer", primary: true, nullable: true })
	declare id: number | null;

	@Column("integer", { nullable: true })
	declare monthly_tokens: number | null;

	@Column("real", { nullable: true })
	declare monthly_active_seconds: number | null;

	@Column("text", { nullable: true })
	declare updated_at: string | null;

	@Column("text", { nullable: true })
	declare updated_by: string | null;

	@Column("integer", { nullable: true })
	declare daily_tokens: number | null;

	@Column("real", { nullable: true })
	declare daily_active_seconds: number | null;
}
