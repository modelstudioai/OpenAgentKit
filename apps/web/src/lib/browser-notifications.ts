/** Web Notification 是体验页的浏览器能力：权限、展示与降级都留在 Web，不进入 SDK。 */
export interface CompletionNotificationInput {
	title: string;
	body: string;
	tag: string;
	icon?: string;
}

let permissionRequest: Promise<boolean> | null = null;

function notificationApi(): typeof Notification | null {
	if (typeof window === "undefined" || !("Notification" in window)) return null;
	return window.Notification;
}

/** 权限申请必须来自发送等用户手势；已授予/拒绝时直接复用浏览器记忆。 */
export function requestCompletionNotificationPermission(): Promise<boolean> {
	const api = notificationApi();
	if (!api) return Promise.resolve(false);
	if (api.permission === "granted") return Promise.resolve(true);
	if (api.permission === "denied") return Promise.resolve(false);
	if (!permissionRequest) {
		permissionRequest = Promise.resolve()
			.then(() => api.requestPermission())
			.then((permission) => permission === "granted")
			.catch(() => false)
			.finally(() => {
				permissionRequest = null;
			});
	}
	return permissionRequest;
}

/** 通知不可用、未获授权或展示抛错时静默降级，不影响对话本身。 */
export function showCompletionNotification(input: CompletionNotificationInput): boolean {
	const api = notificationApi();
	if (api?.permission !== "granted") return false;
	try {
		const notification = new api(input.title, {
			body: input.body,
			tag: input.tag,
			...(input.icon ? { icon: input.icon } : {}),
			lang: typeof document === "undefined" ? undefined : document.documentElement.lang || undefined,
		});
		notification.onclick = () => {
			window.focus();
			notification.close();
		};
		return true;
	} catch {
		return false;
	}
}
