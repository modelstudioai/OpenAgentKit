import { Column, Entity, Index } from "typeorm";

@Entity("quota_request")
@Index("idx_quota_request_subject", ["subject_id", "created_at"])
export class QuotaRequestEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare id: string | null;

	@Column("text")
	declare subject_id: string;

	@Column("integer")
	declare requested_credits: number;

	@Column("text", { nullable: true })
	declare reason: string | null;

	@Column("text", { default: "pending" })
	declare status: string;

	@Column("text", { nullable: true })
	declare mode: string | null;

	@Column("integer", { nullable: true })
	declare granted_credits: number | null;

	@Column("text", { nullable: true })
	declare review_note: string | null;

	@Column("text", { nullable: true })
	declare reviewed_by: string | null;

	@Column("text")
	declare created_at: string;

	@Column("text", { nullable: true })
	declare reviewed_at: string | null;
}
