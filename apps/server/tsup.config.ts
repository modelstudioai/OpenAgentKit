import { copyFile, mkdir, readdir } from "node:fs/promises";
import { defineConfig } from "tsup";

async function copySql(source: URL, target: URL) {
	await mkdir(target, { recursive: true });
	const sql = (await readdir(source)).filter((name) => name.endsWith(".sql"));
	await Promise.all(sql.map((name) => copyFile(new URL(name, source), new URL(name, target))));
}

export default defineConfig({
	entry: { app: "src/app.ts", bin: "src/bin.ts" },
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	target: "node24",
	external: [/^node:/],
	esbuildOptions: (options) => {
		options.packages = "external";
	},
	async onSuccess() {
		const source = new URL("./src/store/schema/", import.meta.url);
		const target = new URL("./dist/schema/", import.meta.url);
		await Promise.all([
			copySql(new URL("generated/", source), target),
			copySql(new URL("history/", source), new URL("history/", target)),
		]);
	},
});
