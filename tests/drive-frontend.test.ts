// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import api from "../app/services/api";

describe("Drive API client", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("listDriveFiles calls the correct endpoint", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers({ "content-type": "application/json" }),
			json: async () => ({
				files: [{ id: "df-1", filename: "test.pdf" }],
				totalCount: 1,
			}),
		} as Response);

		const result = await api.listDriveFiles("test@example.com", { page: "1", limit: "25" });
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/v1/mailboxes/test@example.com/drive?page=1&limit=25"),
			expect.objectContaining({ method: "GET" }),
		);
		expect(result.totalCount).toBe(1);
	});

	it("deleteDriveFile calls the correct endpoint", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 204,
			headers: new Headers(),
		} as Response);

		await api.deleteDriveFile("test@example.com", "df-1");
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/v1/mailboxes/test@example.com/drive/df-1"),
			expect.objectContaining({ method: "DELETE" }),
		);
	});
});
