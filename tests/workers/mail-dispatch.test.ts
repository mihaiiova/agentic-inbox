import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { Folders } from "../../shared/folders";
import { toolSendEmail, toolSendReply } from "../../workers/lib/tools";
import { api, cleanupMailboxFixtures, json, mailboxFixture } from "./helpers";

afterEach(cleanupMailboxFixtures);

describe("Mail Dispatch adapters", () => {
	it("awaits delivery before persisting a browser Sent message and stores attachments safely", async () => {
		const { mailboxId, stub } = await mailboxFixture("dispatch-http");
		const response = await api(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/emails`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				to: "recipient@example.com",
				from: mailboxId,
				subject: "Dispatch success",
				html: "<p>Hello</p>",
				attachments: [{ content: "aGVsbG8=", filename: "../hello.txt", type: "text/plain", disposition: "attachment" }],
			}),
		});

		expect(response.status).toBe(202);
		const result = await json<{ id: string; status: string }>(response);
		expect(result.status).toBe("sent");
		const sent = await stub.getEmail(result.id);
		expect(sent).toMatchObject({ sender: mailboxId, recipient: "recipient@example.com", message_id: expect.any(String) });
		expect(JSON.parse(sent!.raw_headers!)).toEqual(expect.arrayContaining([
			{ key: "from", value: mailboxId },
			{ key: "to", value: "recipient@example.com" },
			{ key: "message-id", value: `<${sent!.message_id}>` },
		]));
		expect(sent?.attachments).toHaveLength(1);
		expect(sent?.attachments?.[0].filename).toBe(".._hello.txt");
		const object = await env.BUCKET.get(`attachments/${result.id}/${sent!.attachments![0].id}/.._hello.txt`);
		expect(await object?.text()).toBe("hello");
	});

	it("returns delivery rejection and does not persist a false-success Sent message", async () => {
		const { mailboxId, stub } = await mailboxFixture("dispatch-rejected");
		const response = await api(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/emails`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				to: "rejected@example.com",
				from: mailboxId,
				subject: "Dispatch rejection",
				text: "This must not be recorded",
			}),
		});

		expect(response.status).toBe(502);
		expect((await json<{ error: string }>(response)).error).toContain("Failed to send email");
		expect(await stub.getEmails({ folder: Folders.SENT })).toHaveLength(0);
	});

	it("uses the same dispatch semantics for MCP send and reply, including reply read state", async () => {
		const { mailboxId, stub, create } = await mailboxFixture("dispatch-mcp");
		const original = await create(Folders.INBOX, {
			subject: "Original",
			sender: "sender@example.com",
			message_id: "original@example.com",
			thread_id: "dispatch-thread",
			read: false,
		});

		const sendResult = await toolSendEmail(env, mailboxId, {
			to: "mcp@example.com",
			subject: "MCP send",
			bodyHtml: "<p>Sent</p>",
		});
		expect(sendResult).toMatchObject({ status: "sent", messageId: expect.any(String) });

		const replyResult = await toolSendReply(env, mailboxId, {
			originalEmailId: original.id,
			to: "reply@example.com",
			subject: "Re: Original",
			bodyHtml: "<p>Reply</p>",
		});
		expect(replyResult).toMatchObject({ status: "sent", messageId: expect.any(String) });
		const reply = await stub.getEmail((replyResult as { messageId: string }).messageId);
		expect(reply).toMatchObject({
			in_reply_to: "original@example.com",
			thread_id: "dispatch-thread",
		});
		expect(JSON.parse(reply!.raw_headers!)).toEqual(expect.arrayContaining([
			{ key: "in-reply-to", value: "<original@example.com>" },
			{ key: "references", value: "<original@example.com>" },
		]));
		expect((await stub.getEmail(original.id))?.read).toBe(true);

		const rejected = await toolSendEmail(env, mailboxId, {
			to: "rejected@example.com",
			subject: "MCP rejection",
			bodyHtml: "<p>Not delivered</p>",
		});
		expect(rejected).toMatchObject({ error: expect.stringContaining("Failed to send email") });
	});
});
