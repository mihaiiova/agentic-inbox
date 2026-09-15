// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * The single outbound Mail Dispatch implementation.
 *
 * HTTP and MCP are transport adapters: this module owns delivery ordering,
 * Sent persistence, IDs, threading headers, attachment storage, and reply
 * read state. In particular, a Sent record is created only after Email
 * Service accepts the message.
 */
import { sendEmail, type SendEmailParams } from "../email-sender";
import { storeAttachments, type StoredAttachment } from "./attachments";
import {
	buildThreadingHeaders,
	generateMessageId,
	SenderValidationError,
	validateSender,
} from "./email-helpers";
import type { EmailFull } from "./schemas";
import { Folders } from "../../shared/folders";
import type { Env } from "../types";

type MailboxDispatchStub = {
	checkSendRateLimit: () => Promise<string | null>;
	createEmail: (folder: string, email: Record<string, unknown>, attachments: StoredAttachment[]) => Promise<unknown>;
	markThreadRead: (threadId: string) => Promise<unknown>;
};

export type DispatchAttachment = NonNullable<SendEmailParams["attachments"]>[number];

export interface MailDispatchRequest {
	env: Env;
	stub: MailboxDispatchStub;
	mailboxId: string;
	to: SendEmailParams["to"];
	from: SendEmailParams["from"];
	subject: string;
	html?: string;
	text?: string;
	cc?: SendEmailParams["cc"];
	bcc?: SendEmailParams["bcc"];
	attachments?: DispatchAttachment[];
	inReplyTo?: string | null;
	references?: string[];
	threadId?: string | null;
	/** Mark this conversation read after the Sent record is persisted. */
	markThreadRead?: string | null;
}

export interface MailDispatchResult {
	messageId: string;
	outgoingMessageId: string;
}

export class MailDispatchRateLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MailDispatchRateLimitError";
	}
}

export class MailDeliveryError extends Error {
	constructor(cause: unknown) {
		const message = cause instanceof Error ? cause.message : String(cause);
		super(message);
		this.name = "MailDeliveryError";
	}
}

function displayAddress(address: SendEmailParams["from"]): string {
	return typeof address === "string" ? address : `${address.name} <${address.email}>`;
}

function displayRecipients(address: string | string[]): string {
	return Array.isArray(address) ? address.join(", ") : address;
}

function makeRawHeaders(request: MailDispatchRequest, outgoingMessageId: string, date: string) {
	const headers = [
		{ key: "from", value: displayAddress(request.from) },
		{ key: "to", value: displayRecipients(request.to) },
		...(request.cc ? [{ key: "cc", value: displayRecipients(request.cc) }] : []),
		...(request.bcc ? [{ key: "bcc", value: displayRecipients(request.bcc) }] : []),
		{ key: "subject", value: request.subject },
		{ key: "date", value: date },
		{ key: "message-id", value: `<${outgoingMessageId}>` },
	];
	if (request.inReplyTo) headers.push({ key: "in-reply-to", value: `<${request.inReplyTo}>` });
	if (request.references?.length) {
		headers.push({ key: "references", value: request.references.map((id) => `<${id}>`).join(" ") });
	}
	return headers;
}

/**
 * Validate, deliver, and record one outbound message.
 *
 * The awaited send is deliberately before attachment persistence and Sent
 * persistence. A rejected delivery therefore cannot create a false-success
 * Sent record or mark a reply's conversation read.
 */
export async function dispatchMail(request: MailDispatchRequest): Promise<MailDispatchResult> {
	const { toStr, fromEmail, fromDomain } = validateSender(request.to, request.from, request.mailboxId);
	const rateLimitError = await request.stub.checkSendRateLimit();
	if (rateLimitError) throw new MailDispatchRateLimitError(rateLimitError);

	const { messageId, outgoingMessageId } = generateMessageId(fromDomain);
	const references = request.references ?? [];
	const threadingHeaders = request.inReplyTo
		? buildThreadingHeaders(request.inReplyTo, references)
		: references.length > 0
			? { References: references.map((id) => `<${id}>`).join(" ") }
			: undefined;

	try {
		await sendEmail(request.env.EMAIL, {
			to: request.to,
			from: request.from,
			subject: request.subject,
			html: request.html,
			text: request.text,
			cc: request.cc,
			bcc: request.bcc,
			attachments: request.attachments,
			headers: threadingHeaders,
		});
	} catch (error) {
		throw new MailDeliveryError(error);
	}

	const attachmentData = await storeAttachments(request.env.BUCKET, messageId, request.attachments);
	const date = new Date().toISOString();
	const body = request.html || request.text || "";
	const sentEmail: Record<string, unknown> = {
		id: messageId,
		subject: request.subject,
		sender: fromEmail,
		recipient: toStr,
		cc: request.cc ? displayRecipients(request.cc).toLowerCase() : null,
		bcc: request.bcc ? displayRecipients(request.bcc).toLowerCase() : null,
		date,
		body,
		in_reply_to: request.inReplyTo || null,
		email_references: references.length ? JSON.stringify(references) : null,
		thread_id: request.threadId || request.inReplyTo || messageId,
		message_id: outgoingMessageId,
		raw_headers: JSON.stringify(makeRawHeaders(request, outgoingMessageId, date)),
	};
	await request.stub.createEmail(Folders.SENT, sentEmail, attachmentData);
	if (request.markThreadRead) await request.stub.markThreadRead(request.markThreadRead);

	return { messageId, outgoingMessageId };
}

/** Resolve the original message and the canonical reply threading values. */
export function replyDispatchFields(original: EmailFull) {
	const originalMsgId = original.message_id || original.id;
	let references: string[] = [];
	if (original.email_references) {
		try {
			references = JSON.parse(original.email_references);
		} catch {
			// Treat malformed legacy references as an empty chain.
		}
	}
	references = [...references, originalMsgId].filter(Boolean);
	return {
		inReplyTo: originalMsgId,
		references,
		threadId: original.thread_id || original.id,
	};
}

export { SenderValidationError };
