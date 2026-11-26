import { Check, Column, Entity, Index } from "typeorm";

@Entity("kit_members")
@Index("idx_members_created", ["created_at", "member_id"])
@Check("auth_type = 'local'")
@Check("status = 'active'")
export class KitMembersEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare member_id: string | null;

	@Column({ type: "text", unique: true, collation: "NOCASE" })
	declare username: string;

	@Column("text")
	declare display_name: string;

	@Column("text", { nullable: true })
	declare email: string | null;

	@Column("text")
	declare auth_type: string;

	@Column("text")
	declare status: string;

	@Column("text")
	declare password_hash: string;

	@Column("text")
	declare created_at: string;

	@Column("text")
	declare updated_at: string;
}
