// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import PostalMime from "postal-mime";
import { z } from "zod";
import { listMailboxes } from "./lib/email-helpers";
import type { StoredAttachment } from "./lib/attachments";
import {
	dispatchMail,
	MailDeliveryError,
	MailDispatchRateLimitError,
	SenderValidationError,
} from "./lib/mail-dispatch";
import { SendEmailRequestSchema } from "./lib/schemas";
import { handleReplyEmail, handleForwardEmail } from "./routes/reply-forward";
import { Folders } from "../shared/folders";
import type { Env } from "./types";
import { requireMailbox, type MailboxContext } from "./lib/mailbox";
import { getMailboxPushoverKey, sendPushoverNotification } from "./lib/notifications";

type AppContext = Context<MailboxContext>;

// -- Request body schemas (kept for validation) ---------------------

const CreateMailboxBody = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	settings: z.record(z.any()).optional(), // mailbox display and compose settings
});

const DraftBody = z.object({
	to: z.string().optional(),
	cc: z.string().optional(),
	bcc: z.string().optional(),
	subject: z.string().optional(),
	body: z.string(),
	in_reply_to: z.string().optional(),
	thread_id: z.string().optional(),
	draft_id: z.string().optional(),
});

// -- Helpers --------------------------------------------------------

function slugify(text: string) { // can return "" for non-alphanumeric input
	return text.toString().toLowerCase()
		.replace(/\s+/g, "-").replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

function intQuery(c: AppContext, key: string): number | undefined {
	const v = c.req.query(key);
	if (!v) return undefined;
	const n = Number(v);
	return Number.isNaN(n) ? undefined : n;
}

function boolQuery(c: AppContext, key: string): boolean | undefined {
	const v = c.req.query(key);
	if (v === undefined || v === "") return undefined;
	return v === "true" || v === "1";
}

// -- App & middleware -----------------------------------------------

const app = new Hono<MailboxContext>();
app.use("/api/*", cors({
	origin: (origin) => {
		// Same-origin requests have no Origin header — allow them.
		if (!origin) return origin;
		// In development, allow localhost for Vite dev server.
		try {
			const url = new URL(origin);
			if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
		} catch { /* invalid origin */ }
		// Block all other cross-origin requests. The app is served from the
		// same origin as the API, so legitimate browser requests never send
		// an Origin header. Returning undefined omits Access-Control-Allow-Origin.
		return undefined;
	},
}));
app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox);

// -- Config ---------------------------------------------------------

app.get("/api/v1/config", (c) => {
	const domainsRaw = c.env.DOMAINS || "";
	const domains = domainsRaw.split(",").map((d) => d.trim()).filter(Boolean);
	const emailAddresses = c.env.EMAIL_ADDRESSES ?? [];
	return c.json({ domains, emailAddresses });
});

// -- Mailboxes ------------------------------------------------------

app.get("/api/v1/mailboxes", async (c) => {
	const allMailboxes = await listMailboxes(c.env.BUCKET);
	return c.json(allMailboxes.map((m) => ({ ...m, name: m.id })));
});

app.post("/api/v1/mailboxes", async (c) => {
	const { name, settings, email: rawEmail } = CreateMailboxBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const allowedAddresses = (c.env.EMAIL_ADDRESSES ?? []) as string[];
	if (allowedAddresses.length > 0 && !allowedAddresses.map((a) => a.toLowerCase()).includes(email)) {
		return c.json({ error: "Mailbox creation is restricted to configured EMAIL_ADDRESSES" }, 403);
	}
	const key = `mailboxes/${email}.json`;
	if (await c.env.BUCKET.head(key)) return c.json({ error: "Mailbox already exists" }, 409);
	const defaultSettings = { fromName: name, forwarding: { enabled: false, email: "" }, signature: { enabled: false, text: "" }, autoReply: { enabled: false, subject: "", message: "" } };
	const finalSettings = { ...defaultSettings, ...settings };
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();
	return c.json({ id: email, email, name, settings: finalSettings }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: await obj.json() });
});

app.put("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { settings } = (await c.req.json()) as { settings: Record<string, unknown> };
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.put(key, JSON.stringify(settings));
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings });
});

app.delete("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.delete(key); // TODO: also delete DO data and R2 attachment blobs
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/test-notification", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const userKey = await getMailboxPushoverKey(c.env, mailboxId);
	if (!userKey) {
		return c.json({ success: false, error: "Pushover user key not configured" }, 400);
	}
	const result = await sendPushoverNotification(c.env, userKey, {
		subject: "Agentic Inbox — Test Notification",
		sender: "Agentic Inbox",
	}, {
		title: "Test Notification",
		message: "Pushover notifications are configured correctly.",
		url: c.env.APP_BASE_URL || undefined,
		url_title: "Open Inbox",
	});
	return c.json(result, result.success ? 200 : 500);
});

// -- Dev seed (development only) -----------------------------------

/**
 * Seeds a demo mailbox with a handful of realistic dummy emails so the UI
 * has something to show during local development. Idempotent: if the demo
 * mailbox already has emails, it returns without inserting anything.
 *
 * Not available in production (`import.meta.env.DEV` is false in builds).
 */
app.post("/api/v1/dev/seed", async (c) => {
	if (!import.meta.env.DEV) {
		return c.json({ error: "Not found" }, 404);
	}

	const DEMO_MAILBOX = "demo@example.com";
	const mailboxKey = `mailboxes/${DEMO_MAILBOX}.json`;

	// 1. Create the demo mailbox if it doesn't exist yet.
	if (!(await c.env.BUCKET.head(mailboxKey))) {
		const settings = {
			fromName: "Demo Inbox",
			forwarding: { enabled: false, email: "" },
			signature: { enabled: false, text: "" },
			autoReply: { enabled: false, subject: "", message: "" },
		};
		await c.env.BUCKET.put(mailboxKey, JSON.stringify(settings));
	}

	// Ensure the Durable Object exists and migrations have run.
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(DEMO_MAILBOX));
	await stub.getFolders();

	// 2. Idempotency guard — don't pile up duplicates on re-runs.
	const existing = await stub.countEmails({ folder: Folders.INBOX });
	if (existing > 0) {
		return c.json({ seeded: false, mailbox: DEMO_MAILBOX, existing });
	}

	// 3. Build dummy emails.
	const now = Date.now();
	const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

	const threadId = crypto.randomUUID();
	const originalMessageId = `${crypto.randomUUID()}@example.com`;

	const seedEmails: {
		folder: string;
		email: Parameters<typeof stub.createEmail>[1];
		attachments: Parameters<typeof stub.createEmail>[2];
	}[] = [
		// A two-message conversation (same thread_id).
		{
			folder: Folders.INBOX,
			email: {
				id: crypto.randomUUID(),
				subject: "Quarterly planning doc",
				sender: "marcus@example.com",
				recipient: DEMO_MAILBOX,
				date: hoursAgo(26),
				read: true,
				body: "<p>Hi team,</p><p>I put together a first pass at the quarterly planning doc. Can you take a look before Thursday's sync?</p><p>Thanks,<br/>Marcus</p>",
				thread_id: threadId,
				message_id: originalMessageId,
				in_reply_to: null,
				email_references: null,
			},
			attachments: [],
		},
		{
			folder: Folders.INBOX,
			email: {
				id: crypto.randomUUID(),
				subject: "Re: Quarterly planning doc",
				sender: "priya@example.com",
				recipient: DEMO_MAILBOX,
				date: hoursAgo(24),
				read: false,
				body: "<p>This looks great. One note: can we pull the launch timeline forward a week? I'll add comments inline.</p><p>— Priya</p>",
				thread_id: threadId,
				message_id: `${crypto.randomUUID()}@example.com`,
				in_reply_to: originalMessageId,
				email_references: JSON.stringify([originalMessageId]),
			},
			attachments: [],
		},
		// A standalone unread email.
		{
			folder: Folders.INBOX,
			email: {
				id: crypto.randomUUID(),
				subject: "Your receipt from Acme Coffee",
				sender: "receipts@acme.example",
				recipient: DEMO_MAILBOX,
				date: hoursAgo(2),
				read: false,
				body: "<p>Thanks for your order!</p><p>1 × Flat White — $4.50<br/>Total: $4.50</p><p>Have a great day,<br/>Acme Coffee</p>",
			},
			attachments: [],
		},
		// A starred, already-read email.
		{
			folder: Folders.INBOX,
			email: {
				id: crypto.randomUUID(),
				subject: "Flight confirmation — SFO → JFK",
				sender: "no-reply@airline.example",
				recipient: DEMO_MAILBOX,
				date: hoursAgo(49),
				read: true,
				starred: true,
				body: "<p>You're all set!</p><p>Flight 1234 departs SFO at 8:30 AM and arrives JFK at 5:15 PM.</p><p>Safe travels!</p>",
			},
			attachments: [],
		},
		// A welcome email, read a while ago.
		{
			folder: Folders.INBOX,
			email: {
				id: crypto.randomUUID(),
				subject: "Welcome to Agentic Inbox",
				sender: "team@example.com",
				recipient: DEMO_MAILBOX,
				date: hoursAgo(120),
				read: true,
				body: "<p>Welcome aboard!</p><p>This is your new inbox. Emails are stored per-mailbox and can be organized with folders and labels.</p>",
			},
			attachments: [],
		},
		// One outbound message so the Sent folder isn't empty.
		{
			folder: Folders.SENT,
			email: {
				id: crypto.randomUUID(),
				subject: "Re: Quarterly planning doc",
				sender: DEMO_MAILBOX,
				recipient: "marcus@example.com",
				date: hoursAgo(23),
				read: true,
				body: "<p>Thanks Marcus — reviewing now and will add my comments this afternoon.</p>",
				thread_id: threadId,
				message_id: `${crypto.randomUUID()}@example.com`,
				in_reply_to: originalMessageId,
				email_references: JSON.stringify([originalMessageId]),
			},
			attachments: [],
		},
	];

	for (const { folder, email, attachments } of seedEmails) {
		await stub.createEmail(folder, email, attachments);
	}

	return c.json({ seeded: true, mailbox: DEMO_MAILBOX, count: seedEmails.length });
});

// -- Emails ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const folder = c.req.query("folder");
	const thread_id = c.req.query("thread_id");
	const threaded = boolQuery(c, "threaded");
	const page = intQuery(c, "page");
	const limit = intQuery(c, "limit");
	const sortColumn = c.req.query("sortColumn") as any;
	const sortDirection = c.req.query("sortDirection") as "ASC" | "DESC" | undefined;
	const stub = c.var.mailboxStub;

	if (threaded && folder) {
		const emails = await (stub as any).getThreadedEmails({ folder, page, limit });
		const emailsWithLabels = await (stub as any).enrichEmailsWithLabels(emails);
		const totalCount = await (stub as any).countThreadedEmails(folder);
		return c.json({ emails: emailsWithLabels, totalCount });
	}
	const emails = await stub.getEmails({ folder, thread_id, page, limit, sortColumn, sortDirection });
	const emailsWithLabels = await (stub as any).enrichEmailsWithLabels(emails);
	if (folder) {
		const totalCount = await stub.countEmails({ folder, thread_id });
		return c.json({ emails: emailsWithLabels, totalCount });
	}
	return c.json(emailsWithLabels);
});

app.post("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments, in_reply_to, references, thread_id } = body;

	try {
		const result = await dispatchMail({
			env: c.env,
			stub: c.var.mailboxStub as any,
			mailboxId,
			to,
			from,
			subject,
			html,
			text,
			cc,
			bcc,
			attachments,
			inReplyTo: in_reply_to,
			references,
			threadId: thread_id,
		});
		// Preserve the existing HTTP contract; unlike before, delivery is awaited.
		return c.json({ id: result.messageId, status: "sent" }, 202);
	} catch (error) {
		if (error instanceof SenderValidationError) return c.json({ error: error.message }, 400);
		if (error instanceof MailDispatchRateLimitError) return c.json({ error: error.message }, 429);
		if (error instanceof MailDeliveryError) return c.json({ error: `Failed to send email: ${error.message}` }, 502);
		throw error;
	}
});

app.post("/api/v1/mailboxes/:mailboxId/drafts", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { to, cc, bcc, subject, body, in_reply_to, thread_id, draft_id } = DraftBody.parse(await c.req.json());
	const stub = c.var.mailboxStub;
	if (draft_id) await stub.deleteEmail(draft_id); // not atomic — create-then-delete would be safer
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();
	await stub.createEmail(Folders.DRAFT, {
		id: messageId, subject: subject || "", sender: mailboxId.toLowerCase(),
		recipient: (to || "").toLowerCase(), cc: cc?.toLowerCase() || null, bcc: bcc?.toLowerCase() || null,
		date: now, body, in_reply_to: in_reply_to || null, email_references: null,
		thread_id: thread_id || in_reply_to || messageId,
	}, []);
	return c.json({ id: messageId, status: "draft", subject: subject || "", recipient: to || "", date: now }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const email = await c.var.mailboxStub.getEmail(c.req.param("id")!);
	if (!email) return c.json({ error: "Email not found" }, 404);
	return new Response(JSON.stringify(email), {
		headers: { "Content-Type": "application/json" },
	});
});

app.put("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const { read, starred } = (await c.req.json()) as { read?: boolean; starred?: boolean };
	const email = await c.var.mailboxStub.updateEmail(c.req.param("id")!, { read, starred });
	return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const id = c.req.param("id")!;
	const attachments = await c.var.mailboxStub.deleteEmail(id);
	if (attachments === null) return c.json({ error: "Not found" }, 404);
	if (attachments.length > 0) await c.env.BUCKET.delete(attachments.map((att: any) => `attachments/${id}/${att.id}/${att.filename}`));
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/move", async (c: AppContext) => {
	const { folderId } = (await c.req.json()) as { folderId: string };
	const success = await c.var.mailboxStub.moveEmail(c.req.param("id")!, folderId);
	return success ? c.json({ status: "moved" }) : c.json({ error: "Folder not found" }, 400);
});

// -- Threads --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/threads/:threadId", async (c: AppContext) => {
	return c.json(await (c.var.mailboxStub as any).getThreadEmails(c.req.param("threadId")!));
});

app.post("/api/v1/mailboxes/:mailboxId/threads/:threadId/read", async (c: AppContext) => {
	await c.var.mailboxStub.markThreadRead(c.req.param("threadId")!);
	return c.json({ status: "marked_read" });
});

// -- Reply / Forward ------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/reply", handleReplyEmail);
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/forward", handleForwardEmail);

// -- Folders --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => c.json(await c.var.mailboxStub.getFolders()));

app.post("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const slug = slugify(name);
	if (!slug) return c.json({ error: "Folder name must contain alphanumeric characters" }, 400);
	const f = await c.var.mailboxStub.createFolder(slug, name);
	return f ? c.json(f, 201) : c.json({ error: "Folder with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const f = await c.var.mailboxStub.updateFolder(c.req.param("id")!, name);
	return f ? c.json(f) : c.json({ error: "Folder not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const ok = await c.var.mailboxStub.deleteFolder(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Folder not found or cannot be deleted" }, 400);
});

// -- Search ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/search", async (c: AppContext) => {
	const searchOpts: Record<string, unknown> = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: boolQuery(c, "is_read"),
		is_starred: boolQuery(c, "is_starred"), has_attachment: boolQuery(c, "has_attachment"),
	};
	const stub = c.var.mailboxStub as any;
	const emails = await stub.searchEmails({ ...searchOpts, page: intQuery(c, "page"), limit: intQuery(c, "limit") });
	const emailsWithLabels = await stub.enrichEmailsWithLabels(emails);
	const totalCount = await stub.countSearchResults(searchOpts);
	return c.json({ emails: emailsWithLabels, totalCount });
});

// -- Labels ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/labels", async (c: AppContext) => {
	return c.json(await c.var.mailboxStub.getLabels());
});

app.post("/api/v1/mailboxes/:mailboxId/labels", async (c: AppContext) => {
	const { name, color } = (await c.req.json()) as { name: string; color?: string };
	if (!name?.trim()) return c.json({ error: "Label name is required" }, 400);
	const id = slugify(name) || crypto.randomUUID();
	const result = await c.var.mailboxStub.createLabel(id, name.trim(), color || "primary");
	return result ? c.json(result, 201) : c.json({ error: "Label with this name already exists" }, 409);
});

app.delete("/api/v1/mailboxes/:mailboxId/labels/:id", async (c: AppContext) => {
	await c.var.mailboxStub.deleteLabel(c.req.param("id")!);
	return c.body(null, 204);
});

// -- Email Labels ----------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:emailId/labels", async (c: AppContext) => {
	const { label_id } = (await c.req.json()) as { label_id: string };
	const emailId = c.req.param("emailId")!;
	await (c.var.mailboxStub as any).addEmailLabel(emailId, label_id);
	return c.json({ status: "labeled" });
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:emailId/labels/:labelId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const labelId = c.req.param("labelId")!;
	await (c.var.mailboxStub as any).removeEmailLabel(emailId, labelId);
	return c.body(null, 204);
});

// -- Attachments ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const attachmentId = c.req.param("attachmentId")!;
	const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
	if (!attachment) return c.json({ error: "Attachment not found" }, 404);
	const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
	if (!obj) return c.json({ error: "Attachment file not found" }, 404);
	const headers = new Headers();
	headers.set("Content-Type", attachment.mimetype);
	const sanitized = attachment.filename.replace(/[\x00-\x1f"\\]/g, "_");
	headers.set("Content-Disposition", `attachment; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
	return new Response(obj.body, { headers });
});

// -- Receive inbound email ------------------------------------------

const MAX_EMAIL_SIZE = 25 * 1024 * 1024;

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number) {
	if (streamSize > MAX_EMAIL_SIZE) throw new Error(`Email too large: ${streamSize} bytes exceeds ${MAX_EMAIL_SIZE} byte limit`);
	if (streamSize <= 0) throw new Error(`Invalid stream size: ${streamSize}`);
	const result = new Uint8Array(streamSize);
	let bytesRead = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (bytesRead + value.length > streamSize) { reader.cancel(); throw new Error(`Stream exceeds declared size`); }
		result.set(value, bytesRead);
		bytesRead += value.length;
	}
	return result;
}

async function receiveEmail(event: { raw: ReadableStream; rawSize: number }, env: Env, ctx: ExecutionContext) {
	const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
	const parsedEmail = await new PostalMime().parse(rawEmail);

	if (!parsedEmail.to?.length || !parsedEmail.to[0].address) throw new Error("received email with empty to");

	const allowedAddresses = ((env.EMAIL_ADDRESSES ?? []) as string[]).map((a) => a.toLowerCase());
	const allRecipients = parsedEmail.to.map((t) => t.address?.toLowerCase()).filter(Boolean) as string[];
	const ccRecipients = (parsedEmail.cc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];
	const bccRecipients = (parsedEmail.bcc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];

	let mailboxId: string | undefined;
	if (allowedAddresses.length > 0) {
		mailboxId = allRecipients.find((addr) => allowedAddresses.includes(addr));
		if (!mailboxId) { console.log(`Ignoring email: no recipient matches EMAIL_ADDRESSES.`); return; }
	} else { mailboxId = allRecipients[0]; }
	if (!mailboxId) throw new Error("received email with no valid recipient address");

	const messageId = crypto.randomUUID();
	if (!(await env.BUCKET.head(`mailboxes/${mailboxId}.json`))) { console.log(`Ignoring email for ${mailboxId}: mailbox does not exist`); return; }

	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));

	const attachmentData: StoredAttachment[] = [];
	if (parsedEmail.attachments) {
		for (const att of parsedEmail.attachments) {
			const attId = crypto.randomUUID();
			const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
			await env.BUCKET.put(`attachments/${messageId}/${attId}/${filename}`, att.content);
			attachmentData.push({ id: attId, email_id: messageId, filename, mimetype: att.mimeType,
				size: typeof att.content === "string" ? att.content.length : att.content.byteLength,
				content_id: att.contentId || null, disposition: att.disposition || "attachment" });
		}
	}

	const extractMsgId = (s: string) => { const m = s.match(/<([^>]+)>/); return m ? m[1] : s.trim().split(/\s+/)[0]; };
	const inReplyTo = parsedEmail.inReplyTo ? extractMsgId(parsedEmail.inReplyTo) : null;
	const emailReferences = parsedEmail.references ? parsedEmail.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [];
	let threadId = emailReferences[0] || inReplyTo || messageId;

	if (!inReplyTo && emailReferences.length === 0) {
		const subjectThread = await (stub as any).findThreadBySubject(parsedEmail.subject || "", parsedEmail.from?.address || undefined);
		if (subjectThread) threadId = subjectThread;
	}

	const originalMessageId = parsedEmail.messageId ? extractMsgId(parsedEmail.messageId) : null;

	await stub.createEmail(Folders.INBOX, {
		id: messageId, subject: parsedEmail.subject || "",
		sender: (parsedEmail.from?.address || "").toLowerCase(), recipient: allRecipients.join(", "),
		cc: ccRecipients.join(", ") || null, bcc: bccRecipients.join(", ") || null,
		date: new Date().toISOString(), // uses receive time, not the email's Date header
		body: parsedEmail.html || parsedEmail.text || "",
		in_reply_to: inReplyTo, email_references: emailReferences.length > 0 ? JSON.stringify(emailReferences) : null,
		thread_id: threadId, message_id: originalMessageId, raw_headers: JSON.stringify(parsedEmail.headers),
	}, attachmentData);

	// Notifications are best-effort and must never make Email Routing retry a
	// message that was already persisted successfully.
	ctx.waitUntil((async () => {
		const userKey = await getMailboxPushoverKey(env, mailboxId);
		if (!userKey) return;
		const result = await sendPushoverNotification(env, userKey, {
			subject: parsedEmail.subject || "New email",
			sender: parsedEmail.from?.address || "Unknown sender",
		}, {
			url: env.APP_BASE_URL
				? `${env.APP_BASE_URL.replace(/\/$/, "")}/mailbox/${encodeURIComponent(mailboxId)}/email/${messageId}`
				: undefined,
			url_title: "Open email",
		});
		if (!result.success) console.warn("Incoming email notification failed:", result.error);
	})());

}

export { app, receiveEmail };
