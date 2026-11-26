import { Check, Column, Entity } from "typeorm";

@Entity("catalog_agents")
@Check("agent_version > 0")
export class CatalogAgentsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare id: string | null;

	@Column("text", { unique: true })
	declare slug: string;

	@Column("text")
	declare display_name: string;

	@Column("text", { nullable: true })
	declare description: string | null;

	@Column("text", { nullable: true })
	declare icon: string | null;

	@Column("text", { nullable: true })
	declare opening_remarks: string | null;

	@Column("text", { default: "[]" })
	declare suggested_prompts: string;

	@Column("text", { default: "{}" })
	declare capabilities: string;

	@Column("text", { nullable: true })
	declare theme: string | null;

	@Column("text")
	declare remote_agent_id: string;

	@Column("integer", { nullable: true })
	declare remote_agent_version: number | null;

	@Column("text", { default: "public" })
	declare visibility: string;

	@Column("integer", { default: 100 })
	declare ordering: number;

	@Column("text", { default: "unlisted" })
	declare status: string;

	@Column("text")
	declare created_at: string;

	@Column("text")
	declare updated_at: string;

	@Column("text", { default: "general" })
	declare category: string;

	@Column("integer", { default: 0 })
	declare featured: number;

	@Column("text", { nullable: true })
	declare remote_environment_id: string | null;

	@Column("text", { default: "[]" })
	declare files_json: string;

	@Column("text", { default: "[]" })
	declare memory_stores_json: string;

	@Column("text", { default: "[]" })
	declare vault_ids_json: string;

	@Column("integer", { nullable: true })
	declare agent_version: number | null;

	@Column("text", { nullable: true })
	declare listed_at: string | null;
}
