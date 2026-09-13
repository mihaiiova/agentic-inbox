import {
	createExecutionContext,
	env,
	SELF,
	waitOnExecutionContext,
	runInDurableObject,
} from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import worker from "../workers/app";
import { Folders } from "../shared/folders";

type MailboxStub = DurableObjectStub<any>;

type EmailSeed = {
	id?: string;
	subject?: string;
	sender?: string;
	recipient?: string;
	date?: string;
	body?: string;
	read?: boolean;
	starred?: boolean;
	thread_id?: string | null;
	message_id?: string | null;
	in_reply_to?: string | null;
	email_references?: string | null;
	cc?: string | null;
	bcc?: string | null;
};

const createdMailboxIds: string[] = [];

async function mailboxFixture(label = "mail-contract") {
	const mailboxId = `${label}-${crypto.randomUUID()}@example.com`;
	createdMailboxIds.push(mailboxId);
	await env.BUCKET.put(`mailboxes/${mailboxId}.json`, JSON.stringify({ fromName: label }));
	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId)) as MailboxStub;
	// The first RPC constructs the object and applies all migrations.
	await stub.getFolders();

	return {
		mailboxId,
		stub,
		async create(folder: string, seed: EmailSeed = {}, attachments: any[] = []) {
			const email = {
				id: seed.id || crypto.randomUUID(),
				subject: seed.subject || "Contract test message",
				sender: seed.sender || "sender@example.com",
				recipient: seed.recipient || mailboxId,
				date: seed.date || new Date().toISOString(),
				body: seed.body || "Contract test body",
				read: seed.read ?? false,
				starred: seed.starred ?? false,
				thread_id: seed.thread_id,
				message_id: seed.message_id,
				in_reply_to: seed.in_reply_to,
				email_references: seed.email_references,
				cc: seed.cc,
				bcc: seed.bcc,
			};
			const linkedAttachments = attachments.map((attachment) => ({ ...attachment, email_id: email.id }));
			await stub.createEmail(folder, email, linkedAttachments);
			return email;
		},
	};
}

async function api(path: string, init?: RequestInit) {
	return SELF.fetch(new Request(`http://localhost${path}`, init));
}

async function json<T = any>(response: Response): Promise<T> {
	return response.json() as Promise<T>;
}

afterEach(async () => {
	for (const mailboxId of createdMailboxIds.splice(0)) {
		await env.BUCKET.delete(`mailboxes/${mailboxId}.json`);
	}
});

describe("MailboxDO mail contract", () => {
	it("runs every mailbox migration and exposes the canonical folders", async () => {
		const { stub } = await mailboxFixture("migrations");
		const folders = await stub.getFolders();

		expect(folders.map((folder: any) => folder.id).sort()).toEqual([
			Folders.ARCHIVE,
			Folders.DRAFT,
			Folders.INBOX,
			Folders.SENT,
			Folders.SPAM,
			Folders.TRASH,
		].sort());
		await expect(stub.getFolders()).resolves.toHaveLength(6);

		const migrationNames = await runInDurableObject(stub, (_instance, state) => [
			...state.storage.sql.exec("SELECT name FROM d1_migrations ORDER BY id"),
		]);
		expect(migrationNames).toHaveLength(14);
	});

	it("supports message create/read/update/delete through the DO RPC seam", async () => {
		const { stub } = await mailboxFixture("rpc-crud");
		const attachment = {
			id: "attachment-1",
			email_id: "message-1",
			filename: "note.txt",
			mimetype: "text/plain",
			size: 4,
			content_id: null,
			disposition: "attachment",
		};
		await stub.createEmail(Folders.INBOX, {
			id: "message-1",
			subject: "CRUD subject",
			sender: "sender@example.com",
			recipient: "rpc-crud@example.com",
			date: new Date().toISOString(),
			body: "CRUD body",
			read: false,
			starred: false,
		}, [attachment]);

		const created = await stub.getEmail("message-1");
		expect(created).toMatchObject({ id: "message-1", subject: "CRUD subject", read: false });
		expect(created.attachments).toHaveLength(1);
		await expect(stub.getEmails({ folder: Folders.INBOX })).resolves.toHaveLength(1);
		expect(await stub.countEmails({ folder: Folders.INBOX })).toBe(1);

		const updated = await stub.updateEmail("message-1", { read: true, starred: true });
		expect(updated).toMatchObject({ read: true, starred: true });
		const deletedAttachments = await stub.deleteEmail("message-1");
		expect(deletedAttachments).toEqual([{ id: "attachment-1", filename: "note.txt" }]);
		expect(await stub.getEmail("message-1")).toBeNull();
		expect(await stub.deleteEmail("message-1")).toBeNull();
	});

	it("supports message create/read/update/delete through the Worker HTTP seam", async () => {
		const { mailboxId } = await mailboxFixture("http-crud");
		const base = `/api/v1/mailboxes/${encodeURIComponent(mailboxId)}`;
		const createdResponse = await api(`${base}/drafts`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ to: "recipient@example.com", subject: "HTTP CRUD", body: "Draft body" }),
		});
		expect(createdResponse.status).toBe(201);
		const created = await json<{ id: string }>(createdResponse);

		const readResponse = await api(`${base}/emails/${created.id}`);
		expect(readResponse.status).toBe(200);
		expect(await json(readResponse)).toMatchObject({ id: created.id, subject: "HTTP CRUD", read: false });

		const updatedResponse = await api(`${base}/emails/${created.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ read: true, starred: true }),
		});
		expect(updatedResponse.status).toBe(200);
		expect(await json(updatedResponse)).toMatchObject({ read: true, starred: true });

		const deletedResponse = await api(`${base}/emails/${created.id}`, { method: "DELETE" });
		expect(deletedResponse.status).toBe(204);
		expect((await api(`${base}/emails/${created.id}`)).status).toBe(404);
	});

	it("keeps threaded list and count totals consistent", async () => {
		const { mailboxId, create } = await mailboxFixture("threaded");
		const threadId = "thread-contract";
		await create(Folders.INBOX, { subject: "Project update", thread_id: threadId, date: "2025-01-01T00:00:00.000Z" });
		await create(Folders.INBOX, { subject: "Re: Project update", thread_id: threadId, read: true, date: "2025-01-02T00:00:00.000Z" });
		await create(Folders.INBOX, { subject: "Unrelated", thread_id: "other-thread", date: "2025-01-03T00:00:00.000Z" });

		const response = await api(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/emails?folder=Inbox&threaded=true`);
		expect(response.status).toBe(200);
		const result = await json<{ emails: any[]; totalCount: number }>(response);
		expect(result.emails).toHaveLength(2);
		expect(result.totalCount).toBe(result.emails.length);
		const project = result.emails.find((email) => email.thread_id === threadId);
		expect(project).toMatchObject({ thread_count: 2, thread_unread_count: 1 });

		const threadResponse = await api(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/threads/${threadId}`);
		expect(await threadResponse.json()).toHaveLength(2);
	});

	it("applies search filters and returns a matching count", async () => {
		const { mailboxId, create } = await mailboxFixture("search");
		await create(Folders.INBOX, {
			subject: "Build report",
			sender: "alice@acme.test",
			recipient: mailboxId,
			body: "The deployment report is ready",
			read: false,
			starred: true,
			date: "2025-02-01T00:00:00.000Z",
		}, [{ id: "report-attachment", email_id: "unused", filename: "report.pdf", mimetype: "application/pdf", size: 10 }]);
		await create(Folders.INBOX, {
			subject: "Lunch plans",
			sender: "bob@example.com",
			recipient: mailboxId,
			body: "See you at noon",
			read: true,
			starred: false,
			date: "2025-02-02T00:00:00.000Z",
		});
		await create(Folders.SENT, {
			subject: "Build follow-up",
			sender: mailboxId,
			recipient: "alice@acme.test",
			body: "Follow-up",
			read: true,
			date: "2025-02-03T00:00:00.000Z",
		});

		const base = `/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/search`;
		const cases = [
			["from=alice", "from=alice@acme.test", 1],
			["subject=Build", "subject=Build", 2],
			["unread", "is_read=false", 1],
			["starred", "is_starred=true", 1],
			["with attachment", "has_attachment=true", 1],
			["date range", "date_start=2025-02-02&date_end=2025-02-03T23:59:59.999Z", 2],
		] as const;
		for (const [label, query, expected] of cases) {
			const response = await api(`${base}?${query}`);
			expect(response.status, label).toBe(200);
			const result = await json<{ emails: any[]; totalCount: number }>(response);
			expect(result.emails, label).toHaveLength(expected);
			expect(result.totalCount, label).toBe(expected);
		}
	});

	it("enforces the hourly rate-limit threshold at 20 sent messages", async () => {
		const { mailboxId, stub, create } = await mailboxFixture("rate-limit");
		for (let i = 0; i < 19; i++) {
			await create(Folders.SENT, { id: `sent-${i}`, date: new Date().toISOString(), sender: mailboxId });
		}
		expect(await stub.checkSendRateLimit()).toBeNull();
		await create(Folders.SENT, { id: "sent-19", date: new Date().toISOString(), sender: mailboxId });
		expect(await stub.checkSendRateLimit()).toBe("Rate limit exceeded: max 20 emails per hour per mailbox");

		const response = await api(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/emails`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				to: "recipient@example.com",
				from: mailboxId,
				subject: "Should be rejected",
				text: "rate limit",
			}),
		});
		expect(response.status).toBe(429);
		expect(await json(response)).toEqual({ error: "Rate limit exceeded: max 20 emails per hour per mailbox" });
	});

	it("receives an inbound message through the Worker email handler", async () => {
		const { mailboxId, stub } = await mailboxFixture("inbound");
		const raw = [
			`From: sender@example.com`,
			`To: ${mailboxId}`,
			"Message-ID: <inbound-message@example.com>",
			"Subject: Inbound receipt",
			"Content-Type: text/plain; charset=utf-8",
			"",
			"This arrived through Email Routing.",
		].join("\r\n");
		const bytes = new TextEncoder().encode(raw);
		const ctx = createExecutionContext();
		await worker.email({ raw: new Response(bytes).body!, rawSize: bytes.byteLength }, env, ctx);
		await waitOnExecutionContext(ctx);

		const messages = await stub.getEmails({ folder: Folders.INBOX });
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({ subject: "Inbound receipt", sender: "sender@example.com" });
		const full = await stub.getEmail(messages[0].id);
		expect(full?.body?.trim()).toBe("This arrived through Email Routing.");
		expect(full?.message_id).toBe("inbound-message@example.com");
	});

	it("returns representative not-found and validation errors from HTTP APIs", async () => {
		const missingMailbox = await api("/api/v1/mailboxes/missing@example.com/emails");
		expect(missingMailbox.status).toBe(404);
		expect(await json(missingMailbox)).toEqual({ error: "Not found" });

		const { mailboxId } = await mailboxFixture("errors");
		const missingEmail = await api(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/emails/missing-id`);
		expect(missingEmail.status).toBe(404);
		expect(await json(missingEmail)).toEqual({ error: "Email not found" });

		const invalidSender = await api(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/emails`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ to: "recipient@example.com", from: "other@example.com", subject: "Rejected", text: "bad sender" }),
		});
		expect(invalidSender.status).toBe(400);
		expect((await json<{ error: string }>(invalidSender)).error).toContain("From address must match the mailbox email address");
	});
});
