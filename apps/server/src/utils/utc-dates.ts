/** UTC 月键 `YYYY-MM`：配额周期与加油包有效期都以它为准（跨时区部署口径一致）。 */
export function monthKey(now: Date): string {
	return now.toISOString().slice(0, 7);
}
/** UTC 日键 `YYYY-MM-DD`（用量热力图与账本分区）。 */
export function dayKey(now: Date): string {
	return now.toISOString().slice(0, 10);
}
/** 次月 1 日 UTC 的 ISO 串（前端展示「重置时间」）。 */
export function resetAtFor(month: string): string {
	const [year, mon] = month.split("-").map(Number) as [number, number];
	return new Date(Date.UTC(year, mon, 1)).toISOString();
}
/** 次日 0 点 UTC 的 ISO 串（日限额重置时间）。 */
export function dayResetAtFor(day: string): string {
	const [year, mon, date] = day.split("-").map(Number) as [number, number, number];
	return new Date(Date.UTC(year, mon - 1, date + 1)).toISOString();
}
export function daysAgoKey(now: Date, days: number): string {
	return dayKey(new Date(now.getTime() - days * 86_400_000));
}
