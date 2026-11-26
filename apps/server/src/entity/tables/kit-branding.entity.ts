import { Check, Column, Entity } from "typeorm";

@Entity("kit_branding")
@Check("id = 1")
export class KitBrandingEntity {
	@Column({ type: "integer", primary: true, nullable: true })
	declare id: number | null;

	@Column("text")
	declare product_name: string;

	@Column("text", { nullable: true })
	declare logo_url: string | null;

	@Column("text")
	declare updated_at: string;

	@Column("text", { nullable: true })
	declare updated_by: string | null;
}
