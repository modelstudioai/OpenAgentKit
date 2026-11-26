import { Column, Entity, ForeignKey } from "typeorm";
import { KitResourceDraftsEntity } from "./kit-resource-drafts.entity.ts";

@Entity("kit_resource_draft_documents")
@ForeignKey(() => KitResourceDraftsEntity, ["draft_id"], ["draft_id"], { onDelete: "CASCADE" })
export class KitResourceDraftDocumentsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare draft_id: string | null;

	@Column("integer", { default: 1 })
	declare revision: number;

	@Column("text")
	declare yaml: string;

	@Column("text", { default: "[]" })
	declare assets_json: string;

	@Column("text", { default: '{"resources":[]}' })
	declare sdk_state_json: string;

	@Column("text", { nullable: true })
	declare proof_json: string | null;
}
