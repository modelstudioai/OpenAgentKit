import { Column, Entity } from "typeorm";

@Entity("kit_preset_packs")
export class KitPresetPacksEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare preset_pack_id: string | null;

	@Column("text")
	declare config_json: string;

	@Column("text")
	declare created_at: string;
}
