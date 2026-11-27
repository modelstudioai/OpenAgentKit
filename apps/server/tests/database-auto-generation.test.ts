import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it, onTestFinished } from "vitest";

const execute = promisify(execFile);
const server = fileURLToPath(new URL("../", import.meta.url));

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "kit-migration-generation-"));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	for (const path of ["src/entity", "src/store", "package.json"]) {
		cpSync(join(server, path), join(root, path), {
			recursive: true,
			filter: (source) => basename(source) !== "generated",
		});
	}
	writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
	symlinkSync(join(server, "node_modules"), join(root, "node_modules"), "junction");
	const store = join(root, "src/store");
	const versions = join(store, "migrations/versions");
	const manifest = join(store, "migration-manifest.json");
	return {
		root,
		member: join(root, "src/entity/tables/kit-members.entity.ts"),
		versions,
		manifest,
		generated: join(store, "migrations/generated"),
		registry: () => JSON.parse(readFileSync(manifest, "utf8")) as { id: string }[],
		registeredFiles: () => readdirSync(versions).sort(),
		generate: (...args: string[]) =>
			execute(process.execPath, ["--import", "tsx", "src/store/migrations/generate.ts", ...args], {
				cwd: root,
			}),
	};
}

it("并发自动生成和重复运行只登记一次可空列迁移，单独校验保持只读", async () => {
	const project = fixture();
	const original = project.registry();
	const files = project.registeredFiles();
	const entity = readFileSync(project.member, "utf8");
	writeFileSync(
		project.member,
		entity.replace(/}\s*$/, '\t@Column("text", { nullable: true })\n\tdeclare test_note: string | null;\n}\n'),
	);

	await expect(project.generate("--check")).rejects.toMatchObject({ stderr: expect.stringMatching(/未生成/) });
	expect(project.registry()).toEqual(original);
	expect(project.registeredFiles()).toEqual(files);

	await Promise.all([project.generate("--auto"), project.generate("--auto")]);
	const registered = project.registry();
	expect(registered.slice(0, -1)).toEqual(original);
	const next = registered.at(-1)!.id;
	expect(project.registeredFiles()).toEqual([...files, `${next}.sql`].sort());
	expect(readFileSync(join(project.versions, `${next}.sql`), "utf8")).toContain('"test_note" TEXT');
	for (const dialect of ["sqlite", "mysql", "postgres"]) {
		const sql = readFileSync(join(project.generated, `migrations.${dialect}.sql`), "utf8");
		expect(sql).toMatch(/ALTER TABLE ["`]?kit_members["`]? ADD COLUMN ["`]?test_note/);
	}

	// 模拟快照已落盘、清单尚未原子替换时退出。下次自动生成应接续同一份快照。
	writeFileSync(project.manifest, JSON.stringify(original));
	await project.generate("--auto");
	expect(project.registry()).toEqual(registered);
	await project.generate("--auto");
	expect(project.registry()).toEqual(registered);
	expect(project.registeredFiles()).toEqual([...files, `${next}.sql`].sort());
}, 30_000);

it("自动生成拒绝猜测字段改名，开发者仍可登记显式的三库升级", async () => {
	const project = fixture();
	const original = project.registry();
	const files = project.registeredFiles();
	const entity = readFileSync(project.member, "utf8");
	writeFileSync(project.member, entity.replace("declare email:", "declare contact_email:"));

	await expect(project.generate("--auto")).rejects.toMatchObject({ stderr: expect.stringMatching(/显式/) });
	expect(project.registry()).toEqual(original);
	expect(project.registeredFiles()).toEqual(files);

	const ddl = "ALTER TABLE kit_members RENAME COLUMN email TO contact_email";
	const steps = { steps: [{ kind: "ddl", sqlite: ddl, mysql: ddl, postgres: ddl }] };
	const input = join(project.root, "rename.json");
	writeFileSync(input, JSON.stringify(steps));
	await project.generate("--name", "rename_member_email", "--steps", input);
	const registered = project.registry();
	expect(registered.slice(0, -1)).toEqual(original);
	const next = registered.at(-1)!.id;
	expect(next).toMatch(/^\d+_rename_member_email$/);
	expect(JSON.parse(readFileSync(join(project.versions, `${next}.steps.json`), "utf8"))).toEqual(steps);
	await project.generate("--check");
}, 30_000);
