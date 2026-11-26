import { Column, Entity } from "typeorm";

@Entity("quota_override")
export class QuotaOverrideEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare subject_id: string | null;

	@Column("integer")
	declare monthly_credits: number;

	@Column("text", { nullable: true })
	declare reason: string | null;

	@Column("text")
	declare updated_by: string;

	@Column("text")
	declare updated_at: string;
}
