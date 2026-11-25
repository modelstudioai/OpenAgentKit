import { Button, Card, Input } from "antd";
import { useTranslation } from "react-i18next";
import { adminBaseUrl, setAdminToken } from "../../lib/auth.ts";
import { LanguageSwitcher } from "../navigation/language-switcher.tsx";
import styles from "./auth.module.less";

export function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
	const { t } = useTranslation("auth");
	return (
		<div className={styles.loginRoot}>
			<Card className={styles.loginCard}>
				<div className="mb-4 flex justify-end">
					<LanguageSwitcher />
				</div>
				<h1 className={styles.loginTitle}>{t("heading")}</h1>
				<p className={styles.loginHint}>
					{t("hintPrefix")} <code>ADMIN_TOKEN</code>
					{t("hintSuffix")}
				</p>
				<p className={styles.loginServer}>
					{t("server")}
					{adminBaseUrl()}
				</p>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						const token = new FormData(event.currentTarget).get("token") as string;
						setAdminToken(token);
						onLogin(token);
					}}
				>
					<Input.Password name="token" required placeholder="ADMIN_TOKEN" className={styles.fieldGap} />
					<Button type="primary" htmlType="submit" block className={styles.fieldGap}>
						{t("submit")}
					</Button>
				</form>
			</Card>
		</div>
	);
}
