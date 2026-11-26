import { Column, Entity, ForeignKey } from "typeorm";
import { CatalogAgentsEntity } from "./catalog-agents.entity.ts";
import { KitTemplatesEntity } from "./kit-templates.entity.ts";

@Entity("kit_template_listings")
@ForeignKey(() => CatalogAgentsEntity, ["catalog_id"], ["id"], { onDelete: "CASCADE" })
@ForeignKey(() => KitTemplatesEntity, ["template_id"], ["template_id"], { onDelete: "CASCADE" })
export class KitTemplateListingsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare template_id: string | null;

	@Column("text", { unique: true })
	declare catalog_id: string;
}
