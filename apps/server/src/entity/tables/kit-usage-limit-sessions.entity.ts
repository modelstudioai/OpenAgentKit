import { Column, Entity, Index } from "typeorm";

@Entity("kit_usage_limit_sessions")
@Index("idx_usage_limit_sessions_member", ["member_id"])
export class KitUsageLimitSessionsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare session_id: string | null;

	@Column("text")
	declare member_id: string;

	@Column("integer", { nullable: true })
	declare input_tokens: number | null;

	@Column("integer", { nullable: true })
	declare output_tokens: number | null;

	@Column("real", { nullable: true })
	declare active_seconds: number | null;

	@Column("text", { nullable: true })
	declare admission_month: string | null;

	@Column("text", { nullable: true })
	declare captured_at: string | null;
}
