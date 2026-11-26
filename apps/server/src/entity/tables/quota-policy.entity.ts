import { Check, Column, Entity } from "typeorm";

@Entity("quota_policy")
@Check("id = 1")
export class QuotaPolicyEntity {
	@Column({ type: "integer", primary: true, nullable: true })
	declare id: number | null;

	@Column("integer")
	declare monthly_credits: number;

	@Column("text", { nullable: true })
	declare updated_at: string | null;

	@Column("text", { nullable: true })
	declare updated_by: string | null;
}
