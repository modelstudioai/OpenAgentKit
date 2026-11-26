import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from "typeorm";
import { KitMembersEntity } from "./kit-members.entity.ts";

@Entity("kit_oidc_member_bindings")
@Unique(["issuer_key", "member_id"])
@ForeignKey(() => KitMembersEntity, ["member_id"], ["member_id"])
export class KitOidcMemberBindingsEntity {
	@PrimaryColumn("text")
	declare subject_key: string;

	@Column("text")
	declare issuer_key: string;

	@Column("text")
	declare member_id: string;

	@Column("text")
	declare subject: string;

	@Column("text")
	declare bound_at: string;
}
