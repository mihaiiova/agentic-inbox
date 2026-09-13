import { env, SELF } from "cloudflare:test";

export type MailboxStub = DurableObjectStub<any>;

export type EmailSeed = {
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

export type AttachmentSeed = {
	id: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id?: string | null;
	disposition?: string | null;
	[key: string]: unknown;
};

const createdMailboxIds: string[] = [];

/** Create an isolated mailbox and its Durable Object RPC test seam. */
export async function mailboxFixture(label = "mail-contract") {
	const mailboxId = `${label}-${crypto.randomUUID()}@example.com`;
	createdMailboxIds.push(mailboxId);
	await env.BUCKET.put(`mailboxes/${mailboxId}.json`, JSON.stringify({ fromName: label }));
	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId)) as MailboxStub;
	// The first RPC constructs the object and applies all migrations.
	await stub.getFolders();

	return {
		mailboxId,
		stub,
		async create(folder: string, seed: EmailSeed = {}, attachments: AttachmentSeed[] = []) {
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

/** Remove mailbox metadata created by fixtures in the current Workers test file. */
export async function cleanupMailboxFixtures() {
	for (const mailboxId of createdMailboxIds.splice(0)) {
		await env.BUCKET.delete(`mailboxes/${mailboxId}.json`);
	}
}

export function api(path: string, init?: RequestInit) {
	return SELF.fetch(new Request(`http://localhost${path}`, init));
}

export function json<T = any>(response: Response): Promise<T> {
	return response.json() as Promise<T>;
}
