export default {
	untitledSession: "Untitled session",
	newSession: "New session",
	header: {
		asideLabel: "Resource panel",
		asideTrigger: "Resources",
		backToPlaza: "Back to plaza",
		asideCollapse: "Collapse resource panel",
		asideExpand: "Expand resource panel",
		closeError: "Dismiss error notice",
	},
	sessionDialog: {
		archiveTitle: "Archive session",
		deleteTitle: "Delete session",
		processing: "Working…",
		confirm: "Confirm",
		refetchPlan: "Refetch plan",
		archiveEffect:
			"After archiving, the session stops accepting new messages; history stays queryable on the provider side.",
		deleteEffect:
			"The running execution will be stopped first, and the latest usage snapshot of this member session will be saved. The session is deleted only after they succeed; messages cannot be recovered, while usage statistics are kept. If stopping or saving fails, the session is preserved and you can retry.",
		busyNote: "Processing, please wait…",
		planning: "Fetching the operation plan…",
	},
	attachment: {
		scanTimeout: "Scan timed out; remove the attachment and retry",
		scanning: "Security scan in progress…",
	},
	errors: {
		sendFailed: "Failed to send message: {{message}}",
		previewFailed: "File preview failed",
		downloadFailed: "File download failed",
		copyFailed: "Copy failed",
	},
	noAgents: {
		title: "No agents published yet",
		hint: "Publish and list an agent in the console, and conversable roles will appear here.",
	},
	emptyChat: {
		chatWith: "Chat with {{name}}",
		hint: "Pick one prompt below, or type your own question",
	},
	aside: {
		agentInfo: "Agent info",
		artifacts: "Artifacts",
		artifactsEmpty: "Files and charts generated after you send a message will appear here",
		openFile: "Open {{name}}",
		downloadFile: "Download {{name}}",
		download: "Download",
		permissions: {
			allow: "Always allow",
			ask: "Ask each time",
		},
		resources: {
			skillsMcp: "Skills & MCP",
			tools: "Tools",
			memory: "Memory",
		},
	},
	sender: {
		attachmentNote: "Attachments are sent with your message",
		placeholderMobile: "Type a message…",
		sendingSr: "Sending",
		addAttachment: "Add attachment",
		attachments: "Attachments",
		uploadImage: "Upload image",
		uploadVideo: "Upload video",
		uploadFile: "Upload file",
	},
	recent: "Recently used",
};
