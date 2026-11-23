export function resolveWebDevPort(value?: string): number {
	const configured = value?.trim() || "5173";
	const port = Number(configured);
	if (!/^\d+$/.test(configured) || port < 1 || port > 65535)
		throw new Error("KIT_WEB_DEV_PORT 必须是 1 到 65535 之间的端口号");
	return port;
}
