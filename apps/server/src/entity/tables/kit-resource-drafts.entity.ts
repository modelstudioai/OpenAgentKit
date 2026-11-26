import { Check, Column, Entity, Index } from "typeorm";

@Entity("kit_resource_drafts")
@Index("idx_resource_drafts_active_owner", ["owner"], {
	unique: true,
	where: "status != 'published' OR cleanup_pending = 1",
})
@Check("status IN ('draft','publishing','published','failed')")
@Check("phase IN ('editable','executing','uncertain','succeeded')")
export class KitResourceDraftsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare draft_id: string | null;

	@Column("text")
	declare owner: string;

	@Column("text")
	declare status: string;

	@Column("text")
	declare phase: string;

	@Column("text", { default: "[]" })
	declare resources_json: string;

	@Column("integer", { default: 0 })
	declare cleanup_pending: number;

	@Column("text", { nullable: true })
	declare operation_id: string | null;

	@Column("text", { nullable: true })
	declare expected_revision: string | null;

	@Column("text")
	declare created_at: string;

	@Column("text")
	declare updated_at: string;

	@Column("text", { nullable: true })
	declare cleanup_key_hash: string | null;

	@Column("text", { default: "directory" })
	declare engine: string;
}
