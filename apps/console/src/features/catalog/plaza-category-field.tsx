import type { PlazaCategory } from "@openagentpack/kit-sdk/protocol";
import { Form, Select } from "antd";
import { useTranslation } from "react-i18next";
import { formRowClass, formRowLabelClass } from "../../lib/form-row.ts";
import styles from "./catalog.module.less";
import { PLAZA_CATEGORIES, plazaCategoryLabel } from "./plaza-categories.ts";

/** 上架条目与模版共用广场分类，不属于 Provider 运行时配置。 */
export function PlazaCategoryField({
	value,
	onChange,
	label,
	required = false,
	horizontal = false,
}: {
	value: PlazaCategory;
	onChange: (value: PlazaCategory) => void;
	label?: string;
	required?: boolean;
	horizontal?: boolean;
}) {
	const { t } = useTranslation("catalog");
	const labelText = label ?? t("plazaCategory");
	const categoryOptions = PLAZA_CATEGORIES.map((id) => ({ value: id, label: plazaCategoryLabel(id, t) }));
	if (horizontal) {
		return (
			<div className={formRowClass}>
				<span className={formRowLabelClass}>
					{labelText}
					{required ? (
						<span aria-hidden="true" className={styles.requiredStar}>
							*
						</span>
					) : null}
				</span>
				<Select
					aria-label={labelText}
					className={styles.fullControl}
					value={value}
					options={categoryOptions}
					onChange={(next) => onChange(next)}
				/>
			</div>
		);
	}
	return (
		<Form component={false} layout="vertical" requiredMark={false}>
			<Form.Item
				label={
					<>
						{labelText}
						{required ? (
							<span aria-hidden="true" className={styles.requiredStar}>
								*
							</span>
						) : null}
					</>
				}
			>
				<Select
					aria-label={labelText}
					className={styles.fullControl}
					value={value}
					options={categoryOptions}
					onChange={(next) => onChange(next)}
				/>
			</Form.Item>
		</Form>
	);
}
