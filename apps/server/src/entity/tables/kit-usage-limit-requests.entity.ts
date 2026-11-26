import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("kit_usage_limit_requests")
@Index("idx_usage_limit_requests_member", ["member_id", "status"])
export class KitUsageLimitRequestsEntity {
	@PrimaryColumn("text")
	declare session_id: string;

	@PrimaryColumn("text")
	declare request_key: string;

	@Column("text")
	declare member_id: string;

	@Column("text")
	declare request_hash: string;

	@Column("text")
	declare status: string;

	@Column("text", { nullable: true })
	declare event_ids: string | null;

	@Column("text", { nullable: true })
	declare previous_status: string | null;

	@Column("text")
	declare created_at: string;
}
