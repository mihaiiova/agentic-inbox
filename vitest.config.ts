import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			"cloudflare:workers": path.resolve(__dirname, "tests/mocks/cloudflare-workers.ts"),
			"~": path.resolve(__dirname, "app"),
			"shared": path.resolve(__dirname, "shared"),
		},
	},
	esbuild: {
		jsx: "automatic",
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./tests/setup.ts"],
	},
});
