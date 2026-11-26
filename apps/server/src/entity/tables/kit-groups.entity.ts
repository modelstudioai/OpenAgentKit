import { Column, Entity, Index } from "typeorm";

@Entity("kit_groups")
@Index("idx_groups_created", ["created_at", "group_id"])
export class KitGroupsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare group_id: string | null;

	@Column("text", { unique: true })
	declare name: string;

	@Column("text", { nullable: true })
	declare description: string | null;

	@Column("integer", { default: 1 })
	declare revision: number;

	@Column("text")
	declare created_at: string;

	@Column("text")
	declare updated_at: string;
}
