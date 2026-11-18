import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkApp, compareLocaleDirs, flattenKeys } from "./check-i18n.mjs";

function makeAppLocaleDirs(zhFiles, enFiles) {
	const root = mkdtempSync(join(tmpdir(), "check-i18n-"));
	const write = (locale, name, body) => {
		const dir = join(root, "src/i18n/locales", locale);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${name}.ts`), `export default ${body};\n`);
	};
	for (const [name, body] of Object.entries(zhFiles)) write("zh-CN", name, body);
	for (const [name, body] of Object.entries(enFiles)) write("en", name, body);
	return root;
}

const localesOf = (root) => [join(root, "src/i18n/locales/zh-CN"), join(root, "src/i18n/locales/en")];

test("flattenKeys 展平嵌套词表为点分键", () => {
	assert.deepEqual(flattenKeys({ a: { b: "x" }, c: "y" }), ["a.b", "c"]);
});

test("en 缺失键时报错并给出键名", async () => {
	const root = makeAppLocaleDirs(
		{ common: `{ languageSwitcher: { zh: "中文", en: "English" } }` },
		{ common: `{ languageSwitcher: { zh: "中文" } }` },
	);
	const problems = await compareLocaleDirs(...localesOf(root));
	assert.deepEqual(problems, ["common.languageSwitcher.en: en 缺失"]);
});

test("en 多出键时报错（zh-CN 是唯一事实来源）", async () => {
	const root = makeAppLocaleDirs({ common: `{ a: "x" }` }, { common: `{ a: "x", b: "y" }` });
	const problems = await compareLocaleDirs(...localesOf(root));
	assert.equal(problems.length, 1);
	assert.match(problems[0], /common\.b: en 多出/);
});

test("命名空间文件缺失时报错", async () => {
	const root = makeAppLocaleDirs({ common: `{ a: "x" }`, chat: `{ b: "y" }` }, { common: `{ a: "x" }` });
	const problems = await compareLocaleDirs(...localesOf(root));
	assert.deepEqual(problems, ["chat: en 缺少命名空间文件"]);
});

test("checkApp 对无词表目录的 app 静默通过", async () => {
	const root = mkdtempSync(join(tmpdir(), "check-i18n-empty-"));
	const { problems, warnings } = await checkApp(root);
	assert.deepEqual(problems, []);
	assert.deepEqual(warnings, []);
});
