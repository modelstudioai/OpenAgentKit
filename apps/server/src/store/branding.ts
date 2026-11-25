import { BRANDING_LOGO_PATH, DEFAULT_BRAND_PRODUCT_NAME } from "@openagentkit/sdk/protocol";
import type { StoreDatabase } from "./database.ts";

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

export function createBrandingStore(db: StoreDatabase) {
	const get = async (): Promise<BrandingRow> => {
		const row = (await db.get(
			"SELECT product_name, logo_url, updated_at, updated_by FROM kit_branding WHERE id = 1",
		)) as BrandingRow | undefined;
		if (row) return row;
		await db.insertIfAbsent(
			"INSERT INTO kit_branding (id, product_name, updated_at) VALUES (1, ?, ?)",
			"id",
			DEFAULT_BRAND_PRODUCT_NAME,
			new Date().toISOString(),
		);
		return await get();
	};
	const clearLogo = async () => {
		await db.run("DELETE FROM kit_branding_logo WHERE id = 1");
	};
	const getLogoMeta = async (): Promise<BrandingLogoMeta | null> => {
		return (
			((await db.get("SELECT content_type, hash, updated_at FROM kit_branding_logo WHERE id = 1")) as
				| BrandingLogoMeta
				| undefined) ?? null
		);
	};
	return {
		get,
		getLogoMeta,
		async getLogo(): Promise<BrandingLogoRow | null> {
			return (
				((await db.get("SELECT content_type, hash, updated_at, bytes FROM kit_branding_logo WHERE id = 1")) as
					| BrandingLogoRow
					| undefined) ?? null
			);
		},
		async update(input: { productName: string; logoUrl?: string | null; updatedBy: string }): Promise<BrandingRow> {
			return db.transaction(async () => {
				const now = new Date().toISOString();
				// 管理端把上传地址解析成绝对 URL 后回传时仍指向当前上传文件：保持二进制，不误清空。
				if (input.logoUrl === undefined || isUploadedLogoUrl(input.logoUrl, await getLogoMeta())) {
					await db.run(
						"UPDATE kit_branding SET product_name = ?, updated_at = ?, updated_by = ? WHERE id = 1",
						input.productName,
						now,
						input.updatedBy,
					);
				} else {
					await clearLogo();
					await db.run(
						"UPDATE kit_branding SET product_name = ?, logo_url = ?, updated_at = ?, updated_by = ? WHERE id = 1",
						input.productName,
						input.logoUrl,
						now,
						input.updatedBy,
					);
				}
				return get();
			});
		},
		async saveLogo(input: {
			contentType: string;
			bytes: Uint8Array;
			hash: string;
			updatedBy: string;
		}): Promise<BrandingLogoMeta> {
			return db.transaction(async () => {
				const now = new Date().toISOString();
				await db.upsert(
					`INSERT INTO kit_branding_logo (id, content_type, bytes, hash, updated_at) VALUES (1, ?, ?, ?, ?)`,
					"id",
					`content_type = excluded.content_type, bytes = excluded.bytes,
				   hash = excluded.hash, updated_at = excluded.updated_at`,
					input.contentType,
					input.bytes,
					input.hash,
					now,
				);
				await db.run(
					"UPDATE kit_branding SET logo_url = NULL, updated_at = ?, updated_by = ? WHERE id = 1",
					now,
					input.updatedBy,
				);
				return { content_type: input.contentType, hash: input.hash, updated_at: now };
			});
		},
	};
}
export type BrandingStore = ReturnType<typeof createBrandingStore>;
