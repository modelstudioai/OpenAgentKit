import type { DatabaseSync } from "node:sqlite";

// 021 的「基线按最后采集日回填」把会话生命周期累计量（含启用前与跨月部分）堆到最近采集日，
// 与「当月已用」明显对不上。重建逐日账：清掉回填行，把每月已记账增量按当月每日调用次数
// 占比分摊（当日真实 Token 无法还原，属估算）；每日总和与月账一致，之后的增量仍由 observe 实时追加。
export function run(db: DatabaseSync) {
	db.exec("DELETE FROM kit_usage_limit_days");
	// 早期旧库升级路径可能还没有 usage_turns（分摊权重来源），此时保持空缺。
	const hasTurns = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usage_turns'").get();
	if (!hasTurns) return;
	const months = db
		.prepare(
			"SELECT member_id, month, tokens, active_seconds FROM kit_usage_limit_months WHERE tokens > 0 OR active_seconds > 0",
		)
		.all() as { member_id: string; month: string; tokens: number; active_seconds: number }[];
	const dayTurns = db.prepare(
		"SELECT day, COUNT(*) AS turns FROM usage_turns WHERE subject_id = ? AND substr(day, 1, 7) = ? GROUP BY day ORDER BY day",
	);
	const insert = db.prepare(
		"INSERT INTO kit_usage_limit_days (member_id, day, tokens, active_seconds) VALUES (?, ?, ?, ?)",
	);
	for (const row of months) {
		const days = dayTurns.all(row.member_id, row.month) as { day: string; turns: number }[];
		// 没有逐日调用记录可做分摊权重的月份保持空缺，不虚构归属日。
		if (days.length === 0) continue;
		const totalTurns = days.reduce((sum, day) => sum + day.turns, 0);
		const shares = days.map((day) => ({
			day: day.day,
			turns: day.turns,
			tokens: Math.floor((row.tokens * day.turns) / totalTurns),
		}));
		// 整数下取整的余数记到调用次数最多的一天（次数相同取靠后日期），保证逐日总和等于月账。
		let allocated = 0;
		for (const share of shares) allocated += share.tokens;
		shares
			.slice()
			.sort((a, b) => b.turns - a.turns || (a.day < b.day ? 1 : -1))
			.slice(0, row.tokens - allocated)
			.forEach((share) => {
				share.tokens += 1;
			});
		let secondsLeft = row.active_seconds;
		shares.forEach((share, index) => {
			const seconds = index === shares.length - 1 ? secondsLeft : (row.active_seconds * share.turns) / totalTurns;
			secondsLeft -= seconds;
			insert.run(row.member_id, share.day, share.tokens, seconds);
		});
	}
}
