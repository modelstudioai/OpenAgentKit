import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("usage_turns")
@Index("idx_usage_turns_idempotency", ["session_id", "client_message_id"], {
	unique: true,
	where: "client_message_id IS NOT NULL",
})
@Index("idx_usage_turns_month_agent", ["month", "agent_slug"])
@Index("idx_usage_turns_subject_month", ["subject_id", "month"])
export class UsageTurnsEntity {
	@PrimaryGeneratedColumn({ type: "integer" })
	declare id: number | null;

	@Column("text")
	declare subject_id: string;

	@Column("text")
	declare agent_slug: string;

	@Column("text")
	declare session_id: string;

	@Column("text", { nullable: true })
	declare client_message_id: string | null;

	@Column("text")
	declare day: string;

	@Column("text")
	declare month: string;

	@Column("text")
	declare created_at: string;
}
