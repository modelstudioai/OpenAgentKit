import { Check, Column, Entity, Index } from "typeorm";

@Entity("kit_uploaded_files")
@Index("idx_uploaded_files_subject", ["subject_id"])
@Check("purpose IN ('experience', 'admin_debug')")
export class KitUploadedFilesEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare file_id: string | null;

	@Column("text")
	declare subject_id: string;

	@Column("text")
	declare created_at: string;

	@Column("text", { default: "experience" })
	declare purpose: string;
}
