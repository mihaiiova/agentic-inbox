// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Context } from "hono";
import type { EmailFull } from "../lib/schemas";
import {
	dispatchMail,
	MailDeliveryError,
	MailDispatchRateLimitError,
	SenderValidationError,
	replyDispatchFields,
} from "../lib/mail-dispatch";
import { SendEmailRequestSchema } from "../lib/schemas";
import { resolveOriginalEmail } from "../lib/email-helpers";
import type { MailboxContext } from "../lib/mailbox";

type AppContext = Context<MailboxContext>;

function dispatchError(c: AppContext, error: unknown) {
	if (error instanceof SenderValidationError) return c.json({ error: error.message }, 400);
	if (error instanceof MailDispatchRateLimitError) return c.json({ error: error.message }, 429);
	if (error instanceof MailDeliveryError) return c.json({ error: `Failed to send email: ${error.message}` }, 502);
	throw error;
}

export async function handleReplyEmail(c: AppContext) {
	const mailboxId = c.req.param("mailboxId") ?? "";
	const id = c.req.param("id") ?? "";
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments } = body;

	const stub = c.var.mailboxStub;
	const rawOriginal = (await stub.getEmail(id)) as EmailFull | null;
	if (!rawOriginal) return c.json({ error: "Original email not found" }, 404);

	const originalEmail = await resolveOriginalEmail(stub, rawOriginal);
	const threading = replyDispatchFields(originalEmail);
	try {
		const result = await dispatchMail({
			env: c.env,
			stub: stub as any,
			mailboxId,
			to,
			from,
			subject,
			html,
			text,
			cc,
			bcc,
			attachments,
			...threading,
			markThreadRead: threading.threadId,
		});
		// Preserve the existing HTTP contract; unlike before, delivery is awaited.
		return c.json({ id: result.messageId, status: "sent" }, 202);
	} catch (error) {
		return dispatchError(c, error);
	}
}

export async function handleForwardEmail(c: AppContext) {
	const mailboxId = c.req.param("mailboxId") ?? "";
	const id = c.req.param("id") ?? "";
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments } = body;

	const stub = c.var.mailboxStub;
	const rawOriginal = (await stub.getEmail(id)) as EmailFull | null;
	if (!rawOriginal) return c.json({ error: "Original email not found" }, 404);
	await resolveOriginalEmail(stub, rawOriginal);

	try {
		const result = await dispatchMail({
			env: c.env,
			stub: stub as any,
			mailboxId,
			to,
			from,
			subject,
			html,
			text,
			cc,
			bcc,
			attachments,
		});
		// Preserve the existing HTTP contract; unlike before, delivery is awaited.
		return c.json({ id: result.messageId, status: "sent" }, 202);
	} catch (error) {
		return dispatchError(c, error);
	}
}
