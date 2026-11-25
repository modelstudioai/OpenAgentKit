export default {
	progressDisconnected: "The operation progress connection was closed",
	title: "Operation logs",
	note: "Only records the current administrator's creates, edits, deletions, listings, and unlistings of agents, plus changes to the employee-side branding.",
	loadFailed: "Failed to load operation logs",
	retry: "Retry",
	empty: "No operation records",
	total: "{{total}} operation records",
	globalTarget: "Global settings",
	version: "Config version v{{version}}",
	columns: {
		at: "Time",
		action: "Operation",
		target: "Target",
	},
	actions: {
		create: "Create agent",
		update: "Edit agent",
		delete: "Delete agent",
		listing: "List agent",
		unlist: "Unlist agent",
		brandingUpdate: "Update branding",
	},
};
