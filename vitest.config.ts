import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL("./src/__tests__/helpers/obsidian-mock.ts", import.meta.url),
			),
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		setupFiles: ["./src/__tests__/helpers/setup-dom.ts"],
	},
});
