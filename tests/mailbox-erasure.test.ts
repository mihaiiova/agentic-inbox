import { describe, expect, it, vi } from "vitest";
import { app } from "../workers/index";
import { MailboxDO } from "../workers/durableObject";
import { DurableObjectState } from "cloudflare:workers";
import { MockDurableObjectStorage } from "./mock-durable-object-storage";

class FakeBucket {
	objects = new Map<string, string | Uint8Array>();
	deleteCalls: (string | string[])[] = [];
	failDeletes = false;
	failAttachmentDeletes = false;

	async head(key: string) {
		return this.objects.has(key) ? {} : null;
	}

	async put(key: string, value: string | Uint8Array) {
		this.objects.set(key, value);
	}

	async delete(keyOrKeys: string | string[]) {
		this.deleteCalls.push(keyOrKeys);
		const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
		if (this.failDeletes || (this.failAttachmentDeletes && keys.some((key) => key.startsWith("attachments/")))) {
			throw new Error("R2 unavailable");
		}
		for (const key of keys) {
			this.objects.delete(key);
		}
	}
}

function countRows(storage: MockDurableObjectStorage, table: string) {
	return [...storage.sql.exec(`SELECT COUNT(*) as count FROM ${table}`)][0] as { count: number };
}

describe("MailboxDO erasure lifecycle", () => {
	it("erases mail-only rows, including labels and attachment metadata, atomically", async () => {
		const storage = new MockDurableObjectStorage();
		const mailbox = new MailboxDO(new DurableObjectState(storage), {} as never);
		await mailbox.ensureDefaultFolders();
		await mailbox.createLabel("important", "Important", "red");
		await mailbox.createEmail("inbox", {
			id: "message-1",
			subject: "Subject",
			sender: "sender@example.com",
			recipient: "mailbox@example.com",
			date: new Date().toISOString(),
			body: "Body",
		}, [{
			id: "attachment-1",
			email_id: "message-1",
			filename: "file.txt",
			mimetype: "text/plain",
			size: 4,
			content_id: null,
			disposition: "attachment",
		}]);
		await mailbox.addEmailLabel("message-1", "important");

		expect(await mailbox.getAttachmentKeys()).toEqual([
			"attachments/message-1/attachment-1/file.txt",
		]);
		await mailbox.eraseMailboxData();

		for (const table of ["folders", "emails", "attachments", "labels", "email_labels"]) {
			expect(countRows(storage, table).count, table).toBe(0);
		}
		// A retry must be a no-op rather than recreating mailbox data.
		await mailbox.eraseMailboxData();
		expect(countRows(storage, "emails").count).toBe(0);
	});

	it("recreates default folders when an erased mailbox address is created again", async () => {
		const storage = new MockDurableObjectStorage();
		const mailbox = new MailboxDO(new DurableObjectState(storage), {} as never);
		await mailbox.ensureDefaultFolders();
		await mailbox.eraseMailboxData();
		expect(await mailbox.getFolders()).toEqual([]);
		await mailbox.ensureDefaultFolders();
		expect((await mailbox.getFolders()).map((folder) => folder.id).sort()).toEqual([
			"archive", "draft", "inbox", "sent", "spam", "trash",
		]);
	});
});

describe("DELETE /api/v1/mailboxes/:mailboxId", () => {
	function makeEnv(bucket: FakeBucket, stub: Record<string, ReturnType<typeof vi.fn>>) {
		return {
			BUCKET: bucket,
			MAILBOX: {
				idFromName: (mailboxId: string) => mailboxId,
				get: () => stub,
			},
		} as never;
	}

	it("deletes settings and attachment blobs before DO data, and is idempotent", async () => {
		const bucket = new FakeBucket();
		bucket.objects.set("mailboxes/mailbox@example.com.json", "settings");
		bucket.objects.set("attachments/message-1/attachment-1/file.txt", new Uint8Array([1]));
		const stub = {
			getAttachmentKeys: vi.fn().mockResolvedValue([
				"attachments/message-1/attachment-1/file.txt",
			]),
			eraseMailboxData: vi.fn().mockResolvedValue(undefined),
		};

		const response = await app.fetch(
			new Request("http://localhost/api/v1/mailboxes/mailbox@example.com", { method: "DELETE" }),
			makeEnv(bucket, stub),
		);
		expect(response.status).toBe(204);
		expect(bucket.objects.size).toBe(0);
		expect(stub.getAttachmentKeys).toHaveBeenCalledOnce();
		expect(stub.eraseMailboxData).toHaveBeenCalledOnce();

		const retry = await app.fetch(
			new Request("http://localhost/api/v1/mailboxes/mailbox@example.com", { method: "DELETE" }),
			makeEnv(bucket, stub),
		);
		expect(retry.status).toBe(204);
		expect(stub.getAttachmentKeys).toHaveBeenCalledTimes(2);
		expect(stub.eraseMailboxData).toHaveBeenCalledTimes(2);
	});

	it("leaves DO metadata for retry when R2 deletion fails", async () => {
		const bucket = new FakeBucket();
		bucket.objects.set("mailboxes/mailbox@example.com.json", "settings");
		const stub = {
			getAttachmentKeys: vi.fn().mockResolvedValue(["attachments/message/attachment/file.txt"]),
			eraseMailboxData: vi.fn().mockResolvedValue(undefined),
		};
		bucket.failAttachmentDeletes = true;

		const failed = await app.fetch(
			new Request("http://localhost/api/v1/mailboxes/mailbox@example.com", { method: "DELETE" }),
			makeEnv(bucket, stub),
		);
		expect(failed.status).toBe(500);
		expect(stub.eraseMailboxData).not.toHaveBeenCalled();

		bucket.failAttachmentDeletes = false;
		const retried = await app.fetch(
			new Request("http://localhost/api/v1/mailboxes/mailbox@example.com", { method: "DELETE" }),
			makeEnv(bucket, stub),
		);
		expect(retried.status).toBe(204);
		expect(stub.eraseMailboxData).toHaveBeenCalledOnce();
	});

	it("retries DO erasure after R2 has already succeeded", async () => {
		const bucket = new FakeBucket();
		const stub = {
			getAttachmentKeys: vi.fn().mockResolvedValue(["attachments/message/attachment/file.txt"]),
			eraseMailboxData: vi.fn()
				.mockRejectedValueOnce(new Error("DO unavailable"))
				.mockResolvedValue(undefined),
		};
		bucket.objects.set("attachments/message/attachment/file.txt", new Uint8Array([1]));

		const failed = await app.fetch(
			new Request("http://localhost/api/v1/mailboxes/mailbox@example.com", { method: "DELETE" }),
			makeEnv(bucket, stub),
		);
		expect(failed.status).toBe(500);
		expect(bucket.objects.has("attachments/message/attachment/file.txt")).toBe(false);

		const retried = await app.fetch(
			new Request("http://localhost/api/v1/mailboxes/mailbox@example.com", { method: "DELETE" }),
			makeEnv(bucket, stub),
		);
		expect(retried.status).toBe(204);
		expect(stub.eraseMailboxData).toHaveBeenCalledTimes(2);
	});
});
