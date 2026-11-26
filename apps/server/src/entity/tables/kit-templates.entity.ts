import { Check, Column, Entity, Index } from "typeorm";

@Entity("kit_templates")
@Index("idx_templates_created", ["created_at", "template_id"])
@Check("version > 0")
export class KitTemplatesEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare template_id: string | null;

	@Column("text", { unique: true })
	declare name: string;

	@Column("text")
	declare remote_agent_id: string;

	@Column("text")
	declare remote_agent_name: string;

	@Column("text")
	declare config_json: string;

	@Column("text")
	declare created_at: string;

	@Column("integer", { default: 1 })
	declare version: number;

	@Column("text", { default: "" })
	declare updated_at: string;
}
