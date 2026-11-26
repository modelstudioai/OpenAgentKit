import { Check, Column, Entity, ForeignKey, PrimaryColumn } from "typeorm";
import { KitTemplatesEntity } from "./kit-templates.entity.ts";

@Entity("kit_template_versions")
@Check("version > 0")
@ForeignKey(() => KitTemplatesEntity, ["template_id"], ["template_id"], { onDelete: "CASCADE" })
export class KitTemplateVersionsEntity {
	@PrimaryColumn("text")
	declare template_id: string;

	@PrimaryColumn("integer")
	declare version: number;

	@Column("text")
	declare config_json: string;

	@Column("text")
	declare created_at: string;
}
