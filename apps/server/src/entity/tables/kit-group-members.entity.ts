import { Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
import { KitGroupsEntity } from "./kit-groups.entity.ts";
import { KitMembersEntity } from "./kit-members.entity.ts";

@Entity("kit_group_members")
@Index("idx_group_members_member", ["member_id", "group_id"])
@ForeignKey(() => KitMembersEntity, ["member_id"], ["member_id"])
@ForeignKey(() => KitGroupsEntity, ["group_id"], ["group_id"])
export class KitGroupMembersEntity {
	@PrimaryColumn("text")
	declare group_id: string;

	@PrimaryColumn("text")
	declare member_id: string;
}
