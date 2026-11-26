import { Column, Entity } from "typeorm";

@Entity("kit_usage_limit_members")
export class KitUsageLimitMembersEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare member_id: string | null;

	@Column("text")
	declare accounting_started_at: string;
}
