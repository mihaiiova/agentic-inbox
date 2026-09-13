import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
	plugins: [
		cloudflareTest({
			main: "./workers/app.ts",
			remoteBindings: false,
			wrangler: { configPath: "./wrangler.test.jsonc" },
		}),
	],
	test: {
		globals: true,
		include: ["tests/mail-contracts.test.ts"],
	},
});
