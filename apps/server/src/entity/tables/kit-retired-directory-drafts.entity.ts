import { Column, Entity } from "typeorm";

@Entity("kit_retired_directory_drafts")
export class KitRetiredDirectoryDraftsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare draft_id: string | null;

	@Column("text")
	declare record_json: string;

	@Column("text", { nullable: true })
	declare document_json: string | null;

	@Column("text")
	declare retired_at: string;
}
