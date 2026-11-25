import type { MemberView } from "@openagentkit/sdk/protocol";
import { Alert, Button, Descriptions, Form, Input, Modal, Popconfirm, Spin } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminClient } from "../../lib/admin/client.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";

export function MemberOidcBindingDialog({
	member,
	client,
	issuer,
	canWrite,
	onClose,
	onPendingChange,
}: {
	member: MemberView;
	client: AdminClient;
	issuer: string;
	canWrite: boolean;
	onClose: () => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const { t } = useTranslation("members");
	const query = useAdminQuery(`members:oidc:${member.member_id}`, (signal) =>
		client.members.oidcBinding(member.member_id, signal),
	);
	const binding = query.data?.data;
	const [sub, setSub] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function changeBinding(action: "bind" | "unbind") {
		if (pending || !canWrite || !query.data || query.error) return;
		setPending(true);
		onPendingChange(true);
		setError(null);
		try {
			if (action === "bind") await client.members.bindOidc(member.member_id, sub.trim());
			else await client.members.unbindOidc(member.member_id);
			onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : t("binding.updateFailed"));
		} finally {
			setPending(false);
			onPendingChange(false);
		}
	}

	return (
		<Modal
			open
			title={t("binding.title", { name: member.display_name })}
			onCancel={pending ? undefined : onClose}
			closable={!pending}
			keyboard={!pending}
			mask={{ closable: !pending }}
			footer={[
				<Button key="close" disabled={pending} onClick={onClose}>
					{t("binding.close")}
				</Button>,
				canWrite && binding && !query.error ? (
					<Popconfirm
						key="unbind"
						title={t("binding.unbindTitle")}
						description={t("binding.unbindDescription")}
						okText={t("binding.unbind")}
						okButtonProps={{ danger: true }}
						onConfirm={() => changeBinding("unbind")}
					>
						<Button danger loading={pending}>
							{t("binding.unbind")}
						</Button>
					</Popconfirm>
				) : canWrite && query.data && !query.error ? (
					<Button
						key="bind"
						type="primary"
						loading={pending}
						disabled={!sub.trim()}
						onClick={() => void changeBinding("bind")}
					>
						{t("binding.save")}
					</Button>
				) : null,
			]}
		>
			<Descriptions column={1} size="small">
				<Descriptions.Item label="Keycloak Realm">{issuer}</Descriptions.Item>
				<Descriptions.Item label={t("columns.memberId")}>{member.member_id}</Descriptions.Item>
				<Descriptions.Item label={t("binding.status")}>
					{t(query.data ? (binding ? "binding.bound" : "binding.unbound") : "binding.pending")}
				</Descriptions.Item>
				{binding && <Descriptions.Item label="Keycloak subject">{binding.sub}</Descriptions.Item>}
			</Descriptions>
			{query.loading && <Spin size="small" />}
			{query.error && (
				<Alert
					type="error"
					message={query.error}
					action={
						<Button size="small" onClick={() => void query.refresh()}>
							{t("list.retry")}
						</Button>
					}
				/>
			)}
			{error && <Alert type="error" message={error} />}
			{query.data && !query.error && !binding && canWrite && (
				<Form layout="vertical" onFinish={() => void changeBinding("bind")}>
					<Form.Item label="Keycloak subject" htmlFor="oidc-subject" extra={t("binding.subjectHint")}>
						<Input
							id="oidc-subject"
							value={sub}
							maxLength={255}
							disabled={pending}
							onChange={(e) => setSub(e.target.value)}
						/>
					</Form.Item>
				</Form>
			)}
		</Modal>
	);
}
