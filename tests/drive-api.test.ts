// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect } from "vitest";
import { app } from "../workers/index";

function createMockEnv(stubOverrides: Record<string, any> = {}) {
	const mockStub = {
		listDriveFiles: async () => ({ files: [], totalCount: 0 }),
		getDriveFile: async () => null,
		deleteDriveFile: async () => true,
		...stubOverrides,
	};
	return {
		MAILBOX: {
			idFromName: () => ({ toString: () => "mock-id" }),
			get: () => mockStub,
		},
		BUCKET: {
			get: async () => null,
			put: async () => {},
			delete: async () => {},
			head: async (key: string) => {
				if (key === "mailboxes/test@example.com.json") return { size: 100 };
				return null;
			},
			list: async () => ({ objects: [] }),
		},
		DOMAINS: "iova.cloud",
		EMAIL_ADDRESSES: [],
	};
}

describe("Drive API", () => {
	it("GET /api/v1/mailboxes/:mailboxId/drive returns drive files", async () => {
		const env = createMockEnv({
			listDriveFiles: async () => ({
				files: [
					{
						id: "df-1",
						email_id: "email-1",
						filename: "invoice.pdf",
						mimetype: "application/pdf",
						size: 12345,
						created_at: "2026-04-30T10:00:00Z",
					},
				],
				totalCount: 1,
			}),
		});

		const req = new Request("http://localhost/api/v1/mailboxes/test@example.com/drive");
		const res = await app.fetch(req, env as any, {} as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.files).toHaveLength(1);
		expect(body.files[0].filename).toBe("invoice.pdf");
		expect(body.totalCount).toBe(1);
	});

	it("GET /api/v1/mailboxes/:mailboxId/drive/:fileId/download returns blob", async () => {
		const env = createMockEnv({
			getDriveFile: async () => ({
				id: "df-1",
				filename: "invoice.pdf",
				mimetype: "application/pdf",
				r2_key: "drive/df-1/invoice.pdf",
			}),
		});
		env.BUCKET.get = async () => ({
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array([1, 2, 3]));
					controller.close();
				},
			}),
		});

		const req = new Request("http://localhost/api/v1/mailboxes/test@example.com/drive/df-1/download");
		const res = await app.fetch(req, env as any, {} as any);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/pdf");
		expect(res.headers.get("Content-Disposition")).toContain("invoice.pdf");
	});

	it("DELETE /api/v1/mailboxes/:mailboxId/drive/:fileId removes file", async () => {
		const deletedKeys: string[] = [];
		const env = createMockEnv({
			getDriveFile: async () => ({
				id: "df-1",
				filename: "invoice.pdf",
				mimetype: "application/pdf",
				r2_key: "drive/df-1/invoice.pdf",
			}),
			deleteDriveFile: async () => true,
		});
		env.BUCKET.delete = async (keys: string | string[]) => {
			if (Array.isArray(keys)) deletedKeys.push(...keys);
			else deletedKeys.push(keys);
		};

		const req = new Request("http://localhost/api/v1/mailboxes/test@example.com/drive/df-1", {
			method: "DELETE",
		});
		const res = await app.fetch(req, env as any, {} as any);
		expect(res.status).toBe(204);
		expect(deletedKeys).toContain("drive/df-1/invoice.pdf");
	});
});
