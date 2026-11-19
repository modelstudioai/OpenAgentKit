import i18n from "i18next";

const MAX_VAULTS = 10;

export function validateCatalogVaults(value: string[]): string | null {
	const t = i18n.getFixedT(null, "catalog");
	if (value.length > MAX_VAULTS) return t("vault.max", { max: MAX_VAULTS });
	const ids = new Set<string>();
	for (const valueId of value) {
		const id = valueId.trim();
		if (!/^[A-Za-z0-9_-]+$/.test(id)) return t("vault.invalid");
		if (ids.has(id)) return t("vault.duplicate");
		ids.add(id);
	}
	return null;
}
