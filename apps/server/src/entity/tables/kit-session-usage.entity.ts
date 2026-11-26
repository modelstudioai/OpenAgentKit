import { Column, Entity, Index } from "typeorm";

@Entity("kit_session_usage")
@Index("idx_session_usage_member", ["member_id", "agent_slug", "created_at", "session_id"])
export class KitSessionUsageEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare session_id: string | null;

	@Column("text")
	declare member_id: string;

	@Column("text")
	declare agent_slug: string;

	@Column("text", { nullable: true })
	declare title: string | null;

	@Column("text", { nullable: true })
	declare status: string | null;

	@Column("text")
	declare created_at: string;

	@Column("integer", { nullable: true })
	declare input_tokens: number | null;

	@Column("integer", { nullable: true })
	declare output_tokens: number | null;

	@Column("integer", { nullable: true })
	declare cache_read_input_tokens: number | null;

	@Column("integer", { nullable: true })
	declare cache_creation_input_tokens: number | null;

	@Column("real", { nullable: true })
	declare active_seconds: number | null;

	@Column("real", { nullable: true })
	declare duration_seconds: number | null;

	@Column("text", { default: "pending" })
	declare collection_status: string;

	@Column("text", { nullable: true })
	declare captured_at: string | null;

	@Column("text", { nullable: true })
	declare attempted_at: string | null;

	@Column("integer", { default: 0 })
	declare capture_revision: number;

	@Column("text", { nullable: true })
	declare finalized_at: string | null;

	@Column("text", { nullable: true })
	declare deleted_at: string | null;
}
