import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { expect, it } from "vitest";
import { ProjectSkillUploads } from "../src/service/admin/resource-draft/uploads/project-skill-uploads.ts";
import { ResourceDraftAssets } from "../src/service/admin/resource-draft/uploads/resource-draft-assets.ts";

const markdown = "---\nname: upload-fixture\ndescription: fixture\n---\n# Upload fixture\n";
async function archive(files: Record<string, string | Uint8Array>, permissions: Record<string, number> = {}) {
	const zip = new JSZip();
	for (const [name, content] of Object.entries(files))
		zip.file(name, content, { unixPermissions: permissions[name] ?? 0o100644 });
	return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", platform: "UNIX" });
}
it("在 JSZip 静默覆盖之前拒绝完全相同的 ZIP 文件路径", async () => {
	const zip = Buffer.from(await archive({ "SKILL.md": markdown, "a.txt": "x", "b.txt": "x" }));
	let cursor = zip.indexOf("b.txt");
	let changed = 0;
	while (cursor !== -1) {
		zip.write("a.txt", cursor);
		changed++;
		cursor = zip.indexOf("b.txt", cursor + 5);
	}
	expect(changed).toBe(2);
	expect(Object.keys((await JSZip.loadAsync(zip)).files)).toEqual(["SKILL.md", "a.txt"]);
	await expect(ProjectSkillUploads.prepare("skill.zip", zip)).rejects.toMatchObject({
		code: "invalid_request",
		message: "ZIP 含重复文件路径",
	});
});
it("拒绝符号链接、超量条目和高压缩率的大文件", async () => {
	await expect(
		ProjectSkillUploads.prepare(
			"skill.zip",
			await archive({ "SKILL.md": markdown, link: "../outside" }, { link: 0o120777 }),
		),
	).rejects.toMatchObject({ code: "invalid_request" });
	await expect(
		ProjectSkillUploads.prepare(
			"skill.zip",
			await archive({
				"SKILL.md": markdown,
				...Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`assets/${index}`, "x"])),
			}),
		),
	).rejects.toMatchObject({ code: "invalid_request" });
	const bomb = await archive({ "SKILL.md": markdown, "large.bin": new Uint8Array(8 * 1024 * 1024 + 1) });
	expect(bomb.length).toBeLessThan(20_000);
	await expect(ProjectSkillUploads.prepare("skill.zip", bomb)).rejects.toMatchObject({ code: "invalid_request" });
	// 即使压缩包谎报原始大小，实际解压流也必须受限，不能只信中央目录声明。
	const forged = Buffer.from(bomb);
	const nameOffset = forged.lastIndexOf("large.bin");
	expect(forged.readUInt32LE(nameOffset - 46)).toBe(0x02014b50);
	forged.writeUInt32LE(1, nameOffset - 46 + 24);
	await expect(ProjectSkillUploads.prepare("skill.zip", forged)).rejects.toMatchObject({
		code: "invalid_request",
		message: "Skill 解压后单文件不能超过 8 MiB，总大小不能超过 32 MiB",
	});
});

it("素材批量保存遇到重名时仅撤销本次已写入的文件，允许调用方重试", async () => {
	const root = await mkdtemp(join(tmpdir(), "kit-draft-assets-"));
	try {
		const store = new ResourceDraftAssets(join(root, "uploads"));
		const firstFile = { path: "file-a/first.txt", bytes: Buffer.from("first") };
		const existingFile = { path: "file-b/existing.txt", bytes: Buffer.from("original") };
		const existing = await store.save([existingFile]);
		await expect(store.save([firstFile, { ...existingFile, bytes: Buffer.from("replacement") }])).rejects.toMatchObject(
			{ code: "EEXIST" },
		);
		await expect(access(join(root, "uploads", firstFile.path))).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readFile(join(root, "uploads", existingFile.path), "utf8")).toBe("original");
		const retried = await store.save([firstFile]);
		await retried.rollback();
		await expect(access(join(root, "uploads", firstFile.path))).rejects.toMatchObject({ code: "ENOENT" });
		await expect(store.verifyHash(existing.assets)).resolves.toMatch(/^[a-f0-9]{64}$/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
