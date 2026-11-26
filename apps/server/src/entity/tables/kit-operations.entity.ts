import { Column, Entity } from "typeorm";

@Entity("kit_operations")
export class KitOperationsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare operation_id: string | null;

	@Column("text")
	declare kind: string;

	@Column("text", { nullable: true })
	declare subject: string | null;

	@Column("text")
	declare status: string;

	@Column("text", { nullable: true })
	declare phase: string | null;

	@Column("real", { default: 0 })
	declare progress: number;

	@Column("text", { default: "[]" })
	declare log: string;

	@Column("text", { nullable: true })
	declare result: string | null;

	@Column("text", { nullable: true })
	declare error: string | null;

	@Column("text")
	declare created_at: string;

	@Column("text")
	declare updated_at: string;

	@Column("text", { nullable: true })
	declare publication_json: string | null;

	@Column("text", { nullable: true })
	declare error_details_json: string | null;
}
