import { UploadOutlined } from "@ant-design/icons";
import {
	BRANDING_LOGO_MAX_BYTES,
	BRANDING_LOGO_PATH,
	BRANDING_LOGO_TYPES,
	type BrandingView,
	DEFAULT_BRAND_PRODUCT_NAME,
} from "@openagentkit/sdk/protocol";
import { Alert, Button, Input, Result, Segmented, Skeleton, Space, Typography, Upload } from "antd";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminApi, getAdminClient } from "../../lib/api.ts";
import { InnerLayout } from "../navigation/inner-layout.tsx";

type LogoMode = "upload" | "url";

function logoError(value: string, t: TFunction<"branding">): string | undefined {
	const logo = value.trim();
	if (!logo) return undefined;
	return (logo.startsWith("/") && !logo.startsWith("//")) || /^https?:\/\//i.test(logo)
		? undefined
		: t("logoInvalidUrl");
}

function fileError(file: File, t: TFunction<"branding">): string | undefined {
	if (!(BRANDING_LOGO_TYPES as readonly string[]).includes(file.type)) return t("fileTypeInvalid");
	if (file.size > BRANDING_LOGO_MAX_BYTES) {
		return t("fileTooLarge", { kb: Math.floor(BRANDING_LOGO_MAX_BYTES / 1024) });
	}
	return undefined;
}

function BrandPreview({ productName, logoUrl }: { productName: string; logoUrl?: string }) {
	const { t } = useTranslation("branding");
	const [failed, setFailed] = useState(false);
	const name = productName.trim() || DEFAULT_BRAND_PRODUCT_NAME;
	return (
		<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
			<Typography.Text type="secondary">{t("previewTitle")}</Typography.Text>
			<div className="mt-3 flex items-center gap-3">
				{logoUrl && !failed ? (
					<img
						src={logoUrl}
						alt=""
						aria-hidden="true"
						className="size-10 rounded-md bg-white object-contain"
						onError={() => setFailed(true)}
					/>
				) : (
					<span
						aria-hidden="true"
						className="grid size-10 place-items-center rounded-md bg-neutral-900 text-sm font-semibold text-white"
					>
						{name.charAt(0).toUpperCase()}
					</span>
				)}
				<span className="min-w-0 break-words text-base font-semibold">{name}</span>
			</div>
		</div>
	);
}

function UploadLogoControl({
	file,
	hasLogo,
	disabled,
	error,
	onFile,
	onRemove,
}: {
	file: File | null;
	hasLogo: boolean;
	disabled: boolean;
	error?: string;
	onFile: (file: File) => void;
	onRemove: () => void;
}) {
	const { t } = useTranslation("branding");
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-3">
				<Upload
					accept={BRANDING_LOGO_TYPES.join(",")}
					showUploadList={false}
					disabled={disabled}
					beforeUpload={(next) => {
						onFile(next);
						return false;
					}}
				>
					<Button icon={<UploadOutlined />} disabled={disabled}>
						{t("chooseImage")}
					</Button>
				</Upload>
				{file ? <span className="min-w-0 break-all text-xs text-neutral-500">{file.name}</span> : null}
				{hasLogo && !file ? (
					<Button type="link" danger disabled={disabled} onClick={onRemove}>
						{t("removeLogo")}
					</Button>
				) : null}
			</div>
			<span className="block text-xs leading-5 text-neutral-500">
				{t("uploadHint", { kb: Math.floor(BRANDING_LOGO_MAX_BYTES / 1024) })}
			</span>
			{error ? <span className="block text-xs text-red-600">{error}</span> : null}
		</div>
	);
}

function useLogoEditor(initialUrl: string | undefined, onDirty: () => void) {
	const { t } = useTranslation("branding");
	const [logoUrl, setLogoUrl] = useState(initialUrl ?? "");
	const [mode, setMode] = useState<LogoMode>("upload");
	const [file, setFile] = useState<File | null>(null);
	const [filePreviewUrl, setFilePreviewUrl] = useState<string>();
	const [uploadError, setUploadError] = useState<string>();
	const [removeLogo, setRemoveLogo] = useState(false);

	useEffect(() => {
		if (!file) {
			setFilePreviewUrl(undefined);
			return;
		}
		const url = URL.createObjectURL(file);
		setFilePreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);

	const changeMode = (next: LogoMode) => {
		setMode(next);
		setFile(null);
		setUploadError(undefined);
		setRemoveLogo(false);
		onDirty();
	};
	const chooseFile = (next: File) => {
		const error = fileError(next, t);
		setUploadError(error);
		if (error) return;
		setFile(next);
		setRemoveLogo(false);
		onDirty();
	};
	const changeUrl = (next: string) => {
		setLogoUrl(next);
		setRemoveLogo(false);
		onDirty();
	};
	const remove = () => {
		setFile(null);
		setUploadError(undefined);
		setRemoveLogo(true);
		onDirty();
	};
	const reset = () => {
		setLogoUrl(initialUrl ?? "");
		setMode("upload");
		setFile(null);
		setUploadError(undefined);
		setRemoveLogo(false);
		onDirty();
	};
	const previewUrl = removeLogo ? undefined : (filePreviewUrl ?? (logoUrl.trim() || undefined));
	return {
		mode,
		logoUrl,
		file,
		uploadError,
		removeLogo,
		previewUrl,
		hasLogo: Boolean((logoUrl || file) && !removeLogo),
		urlError: mode === "url" ? logoError(logoUrl, t) : undefined,
		changeMode,
		changeUrl,
		chooseFile,
		remove,
		reset,
	};
}

function LogoFields({ editor, disabled }: { editor: ReturnType<typeof useLogoEditor>; disabled: boolean }) {
	const { t } = useTranslation("branding");
	return (
		<div className="space-y-4 rounded-lg border border-neutral-200 p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<span className="text-sm font-medium">{t("logo")}</span>
				<Segmented<LogoMode>
					options={[
						{ label: t("modeUpload"), value: "upload" },
						{ label: t("modeUrl"), value: "url" },
					]}
					value={editor.mode}
					disabled={disabled}
					onChange={editor.changeMode}
				/>
			</div>
			{editor.mode === "upload" ? (
				<UploadLogoControl
					file={editor.file}
					hasLogo={editor.hasLogo}
					disabled={disabled}
					error={editor.uploadError}
					onFile={editor.chooseFile}
					onRemove={editor.remove}
				/>
			) : (
				<div className="space-y-3">
					<label htmlFor="branding-logo-url" className="text-sm font-medium">
						{t("logoUrl")}
					</label>
					<Input
						id="branding-logo-url"
						aria-label={t("logoUrl")}
						value={editor.logoUrl}
						placeholder={`${BRANDING_LOGO_PATH} 或 https://cdn.example.com/logo.svg`}
						maxLength={2048}
						status={editor.urlError ? "error" : undefined}
						disabled={disabled}
						onChange={(event) => editor.changeUrl(event.target.value)}
					/>
					<span className="block text-xs leading-5 text-neutral-500">{t("urlHint")}</span>
					{editor.urlError ? <span className="block text-xs text-red-600">{editor.urlError}</span> : null}
				</div>
			)}
		</div>
	);
}

function BrandingForm({
	initial,
	canWrite,
	readOnly,
	onSaved,
	onDirty,
}: {
	initial: BrandingView;
	canWrite: boolean;
	readOnly: boolean;
	onSaved: () => void;
	onDirty: () => void;
}) {
	const { t } = useTranslation("branding");
	const [productName, setProductName] = useState(initial.productName);
	const editor = useLogoEditor(initial.logoUrl, onDirty);
	const save = useAdminMutation(async () => {
		const name = productName.trim();
		if (editor.mode === "upload") {
			if (editor.file) {
				await adminApi.branding.uploadLogo(editor.file);
				return adminApi.branding.update({ productName: name });
			}
			return adminApi.branding.update({ productName: name, ...(editor.removeLogo ? { logoUrl: null } : {}) });
		}
		return adminApi.branding.update({ productName: name, logoUrl: editor.logoUrl.trim() || null });
	});
	const nameError = productName.trim() ? undefined : t("nameRequired");
	const invalid = Boolean(nameError || editor.urlError || editor.uploadError);
	const disabled = !canWrite || save.pending;
	const submit = () => {
		if (!canWrite || save.pending || invalid) return;
		void save.run().then(() => onSaved());
	};
	return (
		<form
			className="max-w-2xl space-y-6"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<div className="space-y-2">
				<label htmlFor="branding-product-name" className="text-sm font-medium">
					{t("productName")}
				</label>
				<Input
					id="branding-product-name"
					aria-label={t("productName")}
					value={productName}
					maxLength={60}
					showCount
					status={nameError ? "error" : undefined}
					disabled={disabled}
					onChange={(event) => {
						setProductName(event.target.value);
						onDirty();
					}}
				/>
				{nameError ? <span className="block text-xs text-red-600">{nameError}</span> : null}
			</div>
			<LogoFields editor={editor} disabled={disabled} />
			<BrandPreview
				key={`${productName}:${editor.previewUrl ?? ""}`}
				productName={productName}
				logoUrl={editor.previewUrl}
			/>
			{readOnly ? <Alert type="info" showIcon title={t("readOnly")} /> : null}
			{save.error ? <Alert type="error" showIcon title={t("saveFailed")} description={save.error} /> : null}
			<Space className="pt-1">
				<Button type="primary" htmlType="submit" loading={save.pending} disabled={!canWrite || invalid}>
					{t("save")}
				</Button>
				<Button
					disabled={disabled}
					onClick={() => {
						setProductName(initial.productName);
						editor.reset();
					}}
				>
					{t("reset")}
				</Button>
			</Space>
		</form>
	);
}

/** 管理端维护员工端名称与 Logo；默认上传，也可切换为 URL。保存后员工端刷新 /api/config 生效。 */
export function BrandingPage() {
	const { t } = useTranslation("branding");
	const query = useAdminQuery("branding:config", (signal) => adminApi.branding.get(signal));
	const identity = useAdminQuery("branding:identity", (signal) => getAdminClient().identity(signal));
	const [saved, setSaved] = useState(false);
	if (query.error)
		return (
			<Result
				status="error"
				title={t("loadFailed")}
				subTitle={query.error}
				extra={
					<Button aria-label={t("retry")} onClick={() => void query.refresh()}>
						{t("retry")}
					</Button>
				}
			/>
		);
	if (!query.data) return <Skeleton active paragraph={{ rows: 5 }} />;
	return (
		<section aria-label={t("sectionAria")} className="space-y-6">
			<InnerLayout title={t("title")} description={t("description")} />
			{saved ? <Alert type="success" showIcon title={t("saved")} /> : null}
			<BrandingForm
				key={`${query.data.updatedAt}:${query.data.productName}:${query.data.logoUrl ?? ""}`}
				initial={query.data}
				canWrite={identity.data?.role === "admin"}
				readOnly={identity.data?.role === "auditor"}
				onDirty={() => setSaved(false)}
				onSaved={() => {
					setSaved(true);
					void query.refresh();
				}}
			/>
		</section>
	);
}
