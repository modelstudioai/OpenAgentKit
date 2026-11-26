import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("kit_oidc_token_revocations")
@Index("idx_oidc_token_revocations_expiry", ["expires_at"])
export class KitOidcTokenRevocationsEntity {
	@PrimaryColumn("text")
	declare token_hash: string;

	@Column("text")
	declare expires_at: string;
}
