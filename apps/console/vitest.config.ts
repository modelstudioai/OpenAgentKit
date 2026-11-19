import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		setupFiles: ["./src/i18n/test-setup.ts"],
		passWithNoTests: true,
	},
});
