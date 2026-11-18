import type { KitStringTable } from "../kit-i18n/index.ts";

/** FileCard 文案键；PDF 等缩写徽标由 fileIcon 输出，不入词典。 */
export interface FileCardStrings {
	types: {
		spreadsheet: string;
		image: string;
		audio: string;
		video: string;
		text: string;
		archive: string;
	};
	loading: string;
	open: string;
	download: string;
}

const fileCardStrings: KitStringTable<FileCardStrings> = {
	"zh-CN": {
		types: { spreadsheet: "表格", image: "图片", audio: "音频", video: "视频", text: "文本", archive: "压缩包" },
		loading: "加载中…",
		open: "打开 {{name}}",
		download: "下载 {{name}}",
	},
	en: {
		types: {
			spreadsheet: "Spreadsheet",
			image: "Image",
			audio: "Audio",
			video: "Video",
			text: "Text",
			archive: "Archive",
		},
		loading: "Loading…",
		open: "Open {{name}}",
		download: "Download {{name}}",
	},
};

export default fileCardStrings;
export { fileCardStrings };
