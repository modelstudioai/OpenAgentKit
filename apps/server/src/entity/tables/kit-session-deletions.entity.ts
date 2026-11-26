import { Column, Entity } from "typeorm";

@Entity("kit_session_deletions")
export class KitSessionDeletionsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare session_id: string | null;

	@Column("text")
	declare subject_id: string;

	@Column("text")
	declare stage: string;

	@Column("text")
	declare updated_at: string;
}
