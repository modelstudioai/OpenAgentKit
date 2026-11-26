import { Column, Entity, Index } from "typeorm";

@Entity("kit_member_sessions")
@Index("idx_member_sessions_expiry", ["expires_at"])
@Index("idx_member_sessions_member", ["member_id"])
export class KitMemberSessionsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare token_hash: string | null;

	@Column("text")
	declare member_id: string;

	@Column("text")
	declare created_at: string;

	@Column("text")
	declare expires_at: string;
}
