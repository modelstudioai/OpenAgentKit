import { Check, Column, Entity } from "typeorm";

@Entity("kit_branding_logo")
@Check("id = 1")
export class KitBrandingLogoEntity {
	@Column({ type: "integer", primary: true, nullable: true })
	declare id: number | null;

	@Column("text")
	declare content_type: string;

	@Column("blob")
	declare bytes: Uint8Array;

	@Column("text")
	declare hash: string;

	@Column("text")
	declare updated_at: string;
}
