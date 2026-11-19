import { Steps } from "antd";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const STEPS = [
	{ id: "config", labelKey: "wizard.configure" },
	{ id: "preview", labelKey: "wizard.preview" },
] as const;
export type TemplateStep = (typeof STEPS)[number]["id"];

export function TemplateWizardSteps({
	step,
	busy,
	canPreview,
	editing,
	onSelect,
}: {
	step: TemplateStep;
	busy: boolean;
	canPreview: boolean;
	editing: boolean;
	onSelect: (step: TemplateStep) => void;
}) {
	const { t } = useTranslation("templates");
	const nav = useRef<HTMLElement>(null);
	const previous = useRef(step);
	useEffect(() => {
		if (previous.current === step) return;
		nav.current?.scrollIntoView({ block: "start" });
		previous.current = step;
	}, [step]);
	return (
		<nav
			ref={nav}
			aria-label={editing ? t("wizard.stepsEditAria") : t("wizard.stepsCreateAria")}
			className="mx-auto mb-6 w-full max-w-xl"
		>
			<Steps
				size="middle"
				current={STEPS.findIndex(({ id }) => id === step)}
				items={STEPS.map(({ id, labelKey }) => ({
					title: t(labelKey),
					disabled: busy || (id === "preview" && !canPreview),
				}))}
				onChange={(index) => {
					const next = STEPS[index];
					if (next) onSelect(next.id);
				}}
			/>
		</nav>
	);
}
