import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	BRANDING_LOGO_PATH,
	type BrandingUpdate,
	type BrandingView,
	DEFAULT_BRAND_PRODUCT_NAME,
} from "@openagentkit/sdk/protocol";
import { KitBrandingEntity } from "../../entity/tables/kit-branding.entity.ts";
import { KitBrandingLogoEntity } from "../../entity/tables/kit-branding-logo.entity.ts";
import { StoreDatabase } from "../../store/database.ts";
import { AuditService } from "./audit.ts";

export interface BrandingRow {
	product_name: string;
	logo_url: string | null;
	updated_at: string;
	updated_by: string | null;
}

export interface BrandingLogoMeta {
	content_type: string;
	hash: string;
	updated_at: string;
}

export interface BrandingLogoRow extends BrandingLogoMeta {
	bytes: Uint8Array;
}

/** 员工端品牌单行配置；读取时缺失行自动重建默认值，避免公开配置因手工删库失败。 */
function isUploadedLogoUrl(url: string | null, logo: BrandingLogoMeta | null): boolean {
	if (!url || !logo) return false;
	const suffix = `${BRANDING_LOGO_PATH}?v=${logo.hash}`;
	return url === suffix || url.endsWith(suffix);
}

@Injectable()
export class BrandingService {
	constructor(
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(AuditService) private readonly audit: AuditService,
	) {}

	/** 供 KitServices.branding 调用的记录接口，沿用原字段名和返回值。 */
	readonly records = {
		get: this.get.bind(this),
		getLogoMeta: this.getLogoMeta.bind(this),
		getLogo: this.logoRecord.bind(this),
		update: this.updateRecord.bind(this),
		saveLogo: this.saveLogo.bind(this),
	};

	async view(): Promise<BrandingView> {
		const row = await this.get();
		const uploaded = await this.getLogoMeta();
		const url = uploaded ? `${BRANDING_LOGO_PATH}?v=${uploaded.hash}` : row.logo_url;
		return {
			productName: row.product_name,
			...(url ? { logoUrl: url } : {}),
			updatedAt: row.updated_at,
			...(row.updated_by ? { updatedBy: row.updated_by } : {}),
		};
	}

	async publicView() {
		const { productName, logoUrl } = await this.view();
		return { productName, ...(logoUrl ? { logoUrl } : {}) };
	}

	async getLogo() {
		const logo = await this.logoRecord();
		return logo && { bytes: logo.bytes, contentType: logo.content_type };
	}

	async uploadLogo(subject: string, contentType: string, bytes: Uint8Array) {
		const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
		await this.saveLogo({ contentType, bytes, hash, updatedBy: subject });
		await this.audit.append({
			subject,
			action: "branding.update",
			target: "employee-web",
			detail: { logoUploaded: true, contentType, bytes: bytes.byteLength },
		});
		return this.view();
	}

	async update(subject: string, input: BrandingUpdate) {
		await this.updateRecord({
			productName: input.productName,
			...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
			updatedBy: subject,
		});
		await this.audit.append({
			subject,
			action: "branding.update",
			target: "employee-web",
			detail: { productName: input.productName, logoUrlChanged: input.logoUrl !== undefined },
		});
		return this.view();
	}

	async get(): Promise<BrandingRow> {
		const row = await this.db.read((manager) =>
			manager.findOne(KitBrandingEntity, {
				where: { id: 1 },
				select: { product_name: true, logo_url: true, updated_at: true, updated_by: true },
			}),
		);
		if (row) return row;
		await this.db.insertEntityIfAbsent(
			KitBrandingEntity,
			{
				id: 1,
				product_name: DEFAULT_BRAND_PRODUCT_NAME,
				updated_at: new Date().toISOString(),
			},
			["id"],
		);
		return this.get();
	}
	async getLogoMeta(): Promise<BrandingLogoMeta | null> {
		return this.db.read((manager) =>
			manager.findOne(KitBrandingLogoEntity, {
				where: { id: 1 },
				select: { content_type: true, hash: true, updated_at: true },
			}),
		);
	}
	private async logoRecord(): Promise<BrandingLogoRow | null> {
		return this.db.read((manager) =>
			manager.findOne(KitBrandingLogoEntity, {
				where: { id: 1 },
				select: { content_type: true, hash: true, updated_at: true, bytes: true },
			}),
		);
	}
	private async updateRecord(input: {
		productName: string;
		logoUrl?: string | null;
		updatedBy: string;
	}): Promise<BrandingRow> {
		return this.db.transaction(async () => {
			const keepLogo = input.logoUrl === undefined || isUploadedLogoUrl(input.logoUrl, await this.getLogoMeta());
			await this.db.write(async (manager) => {
				if (!keepLogo) await manager.delete(KitBrandingLogoEntity, { id: 1 });
				await manager.update(
					KitBrandingEntity,
					{ id: 1 },
					{
						product_name: input.productName,
						updated_at: new Date().toISOString(),
						updated_by: input.updatedBy,
						...(!keepLogo ? { logo_url: input.logoUrl } : {}),
					},
				);
			});
			return this.get();
		});
	}

	async saveLogo(input: {
		contentType: string;
		bytes: Uint8Array;
		hash: string;
		updatedBy: string;
	}): Promise<BrandingLogoMeta> {
		return this.db.transaction(async () => {
			const now = new Date().toISOString();
			await this.db.write(async (manager) => {
				await manager.upsert(
					KitBrandingLogoEntity,
					{
						id: 1,
						content_type: input.contentType,
						bytes: Buffer.from(input.bytes),
						hash: input.hash,
						updated_at: now,
					},
					["id"],
				);
				await manager.update(
					KitBrandingEntity,
					{ id: 1 },
					{ logo_url: null, updated_at: now, updated_by: input.updatedBy },
				);
			});
			return { content_type: input.contentType, hash: input.hash, updated_at: now };
		});
	}
}
