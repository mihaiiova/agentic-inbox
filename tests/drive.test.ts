// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect } from "vitest";
import { MailboxDO } from "../workers/durableObject";
import { MockDurableObjectStorage } from "./mock-durable-object-storage";

function createMockEnv(): any {
	return {
		BUCKET: {
			get: async () => null,
			put: async () => {},
			delete: async () => {},
			head: async () => null,
			list: async () => ({ objects: [] }),
		},
	};
}

describe("Drive — MailboxDO", () => {
	it("lists no drive files when none exist", async () => {
		const storage = new MockDurableObjectStorage();
		const env = createMockEnv();
		const state = { storage };
		const doInstance = new MailboxDO(state as any, env);
		const result = await (doInstance as any).listDriveFiles(1, 25);
		expect(result.files).toEqual([]);
		expect(result.totalCount).toBe(0);
	});

	it("creates and lists a drive file", async () => {
		const storage = new MockDurableObjectStorage();
		const env = createMockEnv();
		const state = { storage, waitUntil: async (_: Promise<any>) => {} };
		const doInstance = new MailboxDO(state as any, env);

		// Seed an email so the FK constraint is satisfied
		await doInstance.createEmail("inbox", {
			id: "email-1",
			subject: "Invoice",
			sender: "billing@acme.com",
			recipient: "test@example.com",
			date: new Date().toISOString(),
			body: "",
		}, []);

		await (doInstance as any).createDriveFile("email-1", {
			id: "att-1",
			email_id: "email-1",
			filename: "invoice.pdf",
			mimetype: "application/pdf",
			size: 12345,
			content_id: null,
			disposition: "attachment",
		}, "drive/test@example.com/df-1/invoice.pdf");

		const result = await (doInstance as any).listDriveFiles(1, 25);
		expect(result.totalCount).toBe(1);
		expect(result.files[0].filename).toBe("invoice.pdf");
		expect(result.files[0].mimetype).toBe("application/pdf");
		expect(result.files[0].size).toBe(12345);
		expect(result.files[0].email_id).toBe("email-1");
	});

	it("gets a drive file by id", async () => {
		const storage = new MockDurableObjectStorage();
		const env = createMockEnv();
		const state = { storage, waitUntil: async (_: Promise<any>) => {} };
		const doInstance = new MailboxDO(state as any, env);

		await doInstance.createEmail("inbox", {
			id: "email-1",
			subject: "Invoice",
			sender: "billing@acme.com",
			recipient: "test@example.com",
			date: new Date().toISOString(),
			body: "",
		}, []);

		const created = await (doInstance as any).createDriveFile("email-1", {
			id: "att-1",
			email_id: "email-1",
			filename: "invoice.pdf",
			mimetype: "application/pdf",
			size: 12345,
			content_id: null,
			disposition: "attachment",
		}, "drive/test@example.com/df-1/invoice.pdf");

		const file = await (doInstance as any).getDriveFile(created.id);
		expect(file).not.toBeNull();
		expect(file.filename).toBe("invoice.pdf");
	});

	it("deletes a drive file by id", async () => {
		const storage = new MockDurableObjectStorage();
		const env = createMockEnv();
		const state = { storage, waitUntil: async (_: Promise<any>) => {} };
		const doInstance = new MailboxDO(state as any, env);

		await doInstance.createEmail("inbox", {
			id: "email-1",
			subject: "Invoice",
			sender: "billing@acme.com",
			recipient: "test@example.com",
			date: new Date().toISOString(),
			body: "",
		}, []);

		const created = await (doInstance as any).createDriveFile("email-1", {
			id: "att-1",
			email_id: "email-1",
			filename: "invoice.pdf",
			mimetype: "application/pdf",
			size: 12345,
			content_id: null,
			disposition: "attachment",
		}, "drive/test@example.com/df-1/invoice.pdf");

		await (doInstance as any).deleteDriveFile(created.id);

		const file = await (doInstance as any).getDriveFile(created.id);
		expect(file).toBeNull();
	});

	it("save_attachment rule action copies attachments to drive", async () => {
		const bucketStore = new Map<string, Uint8Array>();
		const env = {
			BUCKET: {
				get: async (key: string) => {
					const data = bucketStore.get(key);
					if (!data) return null;
					return {
						body: new ReadableStream({
							start(controller) {
								controller.enqueue(data);
								controller.close();
							},
						}),
					};
				},
				put: async (key: string, value: Uint8Array) => {
					bucketStore.set(key, value);
				},
				delete: async () => {},
				head: async () => null,
				list: async () => ({ objects: [] }),
			},
		};
		const storage = new MockDurableObjectStorage();
		let waitUntilPromise: Promise<any> | undefined;
		const state = {
			storage,
			waitUntil: (p: Promise<any>) => {
				waitUntilPromise = p;
			},
		};
		const doInstance = new MailboxDO(state as any, env as any);

		// Create the rule BEFORE the email so orchestrator can evaluate it
		await doInstance.createRule({
			id: "rule-1",
			name: "Save invoices",
			enabled: 1,
			match_all: 1,
			conditions: JSON.stringify([{ field: "from", operator: "contains", value: "billing" }]),
			action_type: "save_attachment",
			action_params: JSON.stringify({}),
		});

		// Create email with attachment (triggers orchestrator)
		const emailId = "email-1";
		const attId = "att-1";
		const filename = "invoice.pdf";
		const r2Key = `attachments/${emailId}/${attId}/${filename}`;
		const blob = new Uint8Array([1, 2, 3, 4, 5]);
		bucketStore.set(r2Key, blob);

		await doInstance.createEmail("inbox", {
			id: emailId,
			subject: "Invoice",
			sender: "billing@acme.com",
			recipient: "test@example.com",
			date: new Date().toISOString(),
			body: "",
		}, [{ id: attId, email_id: emailId, filename, mimetype: "application/pdf", size: 5, content_id: null, disposition: "attachment" }]);

		// Await the orchestrator work triggered by waitUntil
		if (waitUntilPromise) {
			await waitUntilPromise;
		}

		// Verify drive file was created by the orchestrator
		const result = await (doInstance as any).listDriveFiles(1, 25);
		expect(result.totalCount).toBe(1);
		expect(result.files[0].filename).toBe("invoice.pdf");
		expect(result.files[0].mimetype).toBe("application/pdf");
		expect(result.files[0].size).toBe(5);

		// Verify R2 copy exists
		const driveKey = [...bucketStore.keys()].find((k) => k.startsWith("drive/"));
		expect(driveKey).toBeDefined();
		expect(bucketStore.get(driveKey!)).toEqual(blob);
	});
});
