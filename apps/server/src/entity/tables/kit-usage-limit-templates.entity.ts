import { Column, Entity, ForeignKey } from "typeorm";
import { KitTemplatesEntity } from "./kit-templates.entity.ts";

@Entity("kit_usage_limit_templates")
@ForeignKey(() => KitTemplatesEntity, ["template_id"], ["template_id"], { onDelete: "CASCADE" })
export class KitUsageLimitTemplatesEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare template_id: string | null;

	@Column("integer", { nullable: true })
	declare monthly_tokens: number | null;

	@Column("real", { nullable: true })
	declare monthly_active_seconds: number | null;

	@Column("text")
	declare updated_at: string;

	@Column("text")
	declare updated_by: string;

	@Column("integer", { nullable: true })
	declare daily_tokens: number | null;

	@Column("real", { nullable: true })
	declare daily_active_seconds: number | null;
}
