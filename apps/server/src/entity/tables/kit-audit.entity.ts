import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("kit_audit")
export class KitAuditEntity {
	@PrimaryGeneratedColumn({ type: "integer" })
	declare id: number | null;

	@Column("text")
	declare at: string;

	@Column("text", { nullable: true })
	declare subject: string | null;

	@Column("text")
	declare action: string;

	@Column("text", { nullable: true })
	declare target: string | null;

	@Column("text", { nullable: true })
	declare detail: string | null;
}
