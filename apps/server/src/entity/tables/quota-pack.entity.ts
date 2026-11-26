import { Column, Entity, Index } from "typeorm";

@Entity("quota_pack")
@Index("idx_quota_pack_subject", ["subject_id", "month"])
export class QuotaPackEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare id: string | null;

	@Column("text")
	declare subject_id: string;

	@Column("text")
	declare month: string;

	@Column("integer")
	declare credits: number;

	@Column("text", { nullable: true })
	declare reason: string | null;

	@Column("text")
	declare granted_by: string;

	@Column("text")
	declare created_at: string;
}
