import type { KitStringTable } from "../kit-i18n/index.ts";

export interface AttachmentsStrings {
	inlineTitle: string;
	inlineDescription: string;
	dropTitle: string;
	uploading: string;
	uploadingPercent: string;
	progressAria: string;
	uploadFailed: string;
	removeAria: string;
	addFile: string;
}

const attachmentsStrings: KitStringTable<AttachmentsStrings> = {
	"zh-CN": {
		inlineTitle: "上传文件",
		inlineDescription: "点击选择，或把文件拖放到这里",
		dropTitle: "松开即可添加文件",
		uploading: "上传中…",
		uploadingPercent: "上传中 {{percent}}%",
		progressAria: "{{name}} 上传进度",
		uploadFailed: "上传失败",
		removeAria: "移除 {{name}}",
		addFile: "添加文件",
	},
	en: {
		inlineTitle: "Upload files",
		inlineDescription: "Click to choose, or drop files here",
		dropTitle: "Release to add files",
		uploading: "Uploading…",
		uploadingPercent: "Uploading {{percent}}%",
		progressAria: "Upload progress for {{name}}",
		uploadFailed: "Upload failed",
		removeAria: "Remove {{name}}",
		addFile: "Add file",
	},
};

export default attachmentsStrings;
export { attachmentsStrings };
