// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { AIChatAgent } from "@cloudflare/ai-chat";
import {
	streamText,
	convertToModelMessages,
	stepCountIs,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { classifyEmail } from "../lib/classification";
import { getMailboxStub } from "../lib/email-helpers";
import {
	toolListEmails,
	toolGetEmail,
	toolGetThread,
	toolSearchEmails,
	toolDraftReply,
	toolDraftEmail,
	toolMarkEmailRead,
	toolMoveEmail,
	toolDiscardDraft,
} from "../lib/tools";
import { Folders, FOLDER_TOOL_DESCRIPTION, MOVE_FOLDER_TOOL_DESCRIPTION } from "../../shared/folders";
import type { Env } from "../types";

// AI SDK v6 changed tool() overloads significantly. We define tools as plain
// objects matching the Tool type to avoid overload resolution issues.
function defineTool(def: {
	description: string;
	parameters: z.ZodType<any>;
	execute: (...args: any[]) => Promise<any>;
}) {
	return {
		description: def.description,
		inputSchema: def.parameters,
		execute: def.execute,
	};
}

/**
 * Default system prompt used when no custom prompt is configured for a mailbox.
 * Users can override this on a per-mailbox basis via the Settings UI.
 */
const DEFAULT_SYSTEM_PROMPT = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.

## Writing Style
Write like a real person. Short, direct, flowing prose. Get to the point. Plain text only - no HTML tags in your replies.

**Formatting rules:**
- Write in natural paragraphs. NO bullet points, NO numbered lists, NO dashes, NO markdown formatting in email drafts.
- NO bold (**), NO italic (*), NO headers (#), NO horizontal rules (---), NO code blocks. Plain text only.
- Links go inline in the text, not on separate lines.
- Don't structure replies like a template or form letter. Just talk normally.

**Agent Behavior Rules (CRITICAL):**
- NEVER output meta-commentary about what you are doing (e.g. do not say "I am drafting a reply to Alex", "I checked the thread", etc).
- When a new email arrives, your ONLY job is to call the \`draft_reply\` tool.
- DO NOT summarize the email. DO NOT explain your actions.
- Output NOTHING except the tool call. If you must output text, it should ONLY be the literal draft text itself if tools fail.
- Before drafting ANY reply, carefully read the full thread history.
- NEVER repeat information that was already shared in a prior message in the thread.
- Your reply should only contain NEW information or directly respond to what the person just said. Move the conversation forward, don't rehash it.

## Who Are You Replying To?
Use the name the person gives in their email body / signature. That's their name - use it. The "from" address is where you send the reply, but the name in the email is how you greet them.

## CRITICAL: Draft Only - Never Send
You can ONLY draft emails. You do NOT have the ability to send emails directly.

- Use draft_reply to draft replies to existing emails
- Use draft_email to draft new outbound emails
- The operator will review and send drafts from the UI - you cannot send them

**CRITICAL: The draft body must contain ONLY the email text.** Never include agent commentary, status messages, meta-notes, markdown formatting, or anything that isn't part of the actual email in the draft body. No "Draft created.", no "---", no "**bold**", no "Here's the draft:", no separators. The body field is the literal email the recipient will read. Everything else goes in your chat message, not in the draft body.

**Don't paste draft contents into the chat.** The drafts are saved via tools - the operator can see them in the Drafts folder. In your chat message, just briefly say what you drafted (e.g. "Drafted a reply to Tim"). Don't duplicate the full email body in the chat.

## Draft Management
Use discard_draft to delete drafts that the operator rejects or that are no longer needed.

## Creating Automation Rules
You can create rules via the create_static_rule and create_agent_rule tools.

**When to use which:**
- Use create_static_rule for condition-based rules (field matching + optional AI classification). These are cheap at runtime.
- Use create_agent_rule when the user describes something semantic that can't be captured by simple conditions (e.g. "if it looks important").

**Logic guidance for create_static_rule:**
- When the user says "contains X" or "is about X", they mean "any signal matches" — set match_all=false (OR logic).
- When the user says "must be X AND Y" or "only if both", set match_all=true (AND logic).
- DEFAULT to match_all=false unless the user explicitly wants multiple conditions to ALL be required.
- For "contains an invoice" type requests, prefer ONE classification condition: {field:"body", operator:"classification", value:"does this email contain or refer to an invoice?"}. This is more reliable than checking specific fields like subject + body separately.
- You can mix cheap string conditions with classification conditions in the same rule.

**Action guidance:**
- add_label: attach a label to the email
- save_attachment: copy attachments to the mailbox Drive
- send_notification: send a Pushover notification (requires the user to have set up their Pushover key in settings)`;

/**
 * Fetch the custom system prompt for a mailbox from its R2 settings.
 * Falls back to DEFAULT_SYSTEM_PROMPT if none is configured.
 */
async function getSystemPrompt(env: Env, mailboxId: string): Promise<string> {
	try {
		const key = `mailboxes/${mailboxId}.json`;
		const obj = await env.BUCKET.get(key);
		if (obj) {
			const settings = await obj.json<Record<string, unknown>>();
			if (typeof settings.agentSystemPrompt === "string" && settings.agentSystemPrompt.trim()) {
				return settings.agentSystemPrompt;
			}
		}
	} catch {
		// Fall through to default
	}
	return DEFAULT_SYSTEM_PROMPT;
}

function createEmailTools(env: Env, mailboxId: string) {
	return {
		list_emails: defineTool({
			description:
				"List emails in a folder. Returns email metadata (id, subject, sender, recipient, date, read/starred status, thread_id). Use folder='inbox' for received emails, 'sent' for sent emails.",
			parameters: z.object({
				folder: z
					.string()
					.default(Folders.INBOX)
					.describe(FOLDER_TOOL_DESCRIPTION),
				limit: z
					.number()
					.default(20)
					.describe("Maximum number of emails to return"),
				page: z
					.number()
					.default(1)
					.describe("Page number for pagination"),
			}),
			execute: async ({ folder, limit, page }): Promise<unknown> => {
				return toolListEmails(env, mailboxId, { folder, limit, page });
			},
		}),

		get_email: defineTool({
			description:
				"Get a single email with its full body content and attachments. Use this to read the actual content of an email.",
			parameters: z.object({
				emailId: z.string().describe("The email ID to retrieve"),
			}),
			execute: async ({ emailId }): Promise<unknown> => {
				return toolGetEmail(env, mailboxId, emailId);
			},
		}),

		get_thread: defineTool({
			description:
				"Get all emails in a conversation thread. This is essential for understanding the full context of a conversation before drafting a response. Returns all messages sorted chronologically.",
			parameters: z.object({
				threadId: z
					.string()
					.describe(
						"The thread_id to retrieve all messages for. Get this from an email's thread_id field.",
					),
			}),
			execute: async ({ threadId }): Promise<unknown> => {
				return toolGetThread(env, mailboxId, threadId);
			},
		}),

		search_emails: defineTool({
			description:
				"Search for emails matching a query across subject and body fields.",
			parameters: z.object({
				query: z
					.string()
					.describe(
						"Search query to match against subject and body",
					),
				folder: z
					.string()
					.optional()
					.describe("Optional folder to restrict search to"),
			}),
			execute: async ({ query, folder }): Promise<unknown> => {
				return toolSearchEmails(env, mailboxId, { query, folder });
			},
		}),

		draft_email: defineTool({
			description:
				"Draft a new email (not a reply) and save it to the Drafts folder. This does NOT send — it saves a draft for the operator to review. Use this for composing new outbound emails. Write the body as plain text — no HTML tags.",
			parameters: z.object({
				to: z.string().email().describe("Recipient email address"),
				subject: z
					.string()
					.describe("Subject line"),
				body: z
					.string()
					.describe(
						"The plain text body of the email. No HTML — just write normally.",
					),
			}),
			execute: async ({ to, subject, body }): Promise<unknown> => {
				return toolDraftEmail(env, mailboxId, {
					to,
					subject,
					body,
					isPlainText: true,
				});
			},
		}),

		draft_reply: defineTool({
			description:
				"Draft a reply to an existing email and save it to the Drafts folder. This does NOT send — it saves a draft for the operator to review and send from the UI. Write the body as plain text — no HTML tags.",
			parameters: z.object({
				originalEmailId: z
					.string()
					.describe("The ID of the email being replied to"),
				to: z.string().email().describe("Recipient email address"),
				subject: z
					.string()
					.describe("Subject line (usually 'Re: ...')"),
				body: z
					.string()
					.describe(
						"The plain text body of the reply. No HTML — just write normally.",
					),
			}),
			execute: async ({ originalEmailId, to, subject, body }): Promise<unknown> => {
				return toolDraftReply(env, mailboxId, {
					originalEmailId,
					to,
					subject,
					body,
					isPlainText: true,
					runVerifyDraft: true,
				});
			},
		}),

		mark_email_read: defineTool({
			description: "Mark an email as read or unread.",
			parameters: z.object({
				emailId: z.string().describe("The email ID"),
				read: z
					.boolean()
					.describe("true to mark as read, false for unread"),
			}),
			execute: async ({ emailId, read }): Promise<unknown> => {
				return toolMarkEmailRead(env, mailboxId, emailId, read);
			},
		}),

		move_email: defineTool({
			description:
				"Move an email to a different folder (inbox, sent, draft, archive, trash).",
			parameters: z.object({
				emailId: z.string().describe("The email ID"),
				folderId: z
					.string()
					.describe(MOVE_FOLDER_TOOL_DESCRIPTION),
			}),
			execute: async ({ emailId, folderId }): Promise<unknown> => {
				return toolMoveEmail(env, mailboxId, emailId, folderId);
			},
		}),

		discard_draft: defineTool({
			description:
				"Delete a draft email. Use this to discard drafts that are no longer needed or were rejected by the operator.",
			parameters: z.object({
				draftId: z.string().describe("The ID of the draft to delete"),
			}),
			execute: async ({ draftId }): Promise<unknown> => {
				return toolDiscardDraft(env, mailboxId, draftId);
			},
		}),

		create_static_rule: defineTool({
			description: `Create a deterministic rule that automatically processes incoming emails based on conditions.

**Logic guidance:**
- When the user says "contains X" or "is about X", they usually mean "if ANY signal matches" — use match_all=false (OR logic).
- When the user says "must be X AND Y" or "only if both", use match_all=true (AND logic).
- For "contains an invoice" type requests, prefer a SINGLE classification condition over multiple field checks: {field:"body", operator:"classification", value:"does this email contain or refer to an invoice?"} with match_all=false. This is more reliable than checking specific fields.

**Condition operators:**
- contains/equals/starts_with/ends_with/matches: cheap string matching on a specific field
- classification: AI-powered semantic matching. The value is a natural language prompt.`,
			parameters: z.object({
				name: z.string().describe("A descriptive name for the rule"),
				enabled: z.boolean().default(true).describe("Whether the rule is active"),
				match_all: z.boolean().default(false).describe("CRITICAL: If false, ANY condition matching triggers the rule (OR — good for 'contains X'). If true, ALL conditions must match (AND — good for 'must be X and Y'). Default to false unless user explicitly wants AND logic."),
				conditions: z.array(
					z.object({
						field: z.enum(["from", "to", "cc", "subject", "body"]).describe("The email field to check. For classification, 'body' is conventional but the field is ignored — the AI sees the whole email."),
						operator: z.enum(["contains", "equals", "starts_with", "ends_with", "matches", "classification"]).describe("How to compare. Use 'classification' for AI semantic matching."),
						value: z.string().describe("The value to compare. For 'classification', write a clear prompt like 'does this email contain or refer to an invoice?'"),
					}),
				).describe("Array of conditions. For broad matching like 'contains X', prefer ONE classification condition rather than many field checks."),
				action_type: z.enum(["add_label", "save_attachment", "send_notification"]).describe("What to do when the rule matches"),
				action_params: z.record(z.unknown()).describe("Action parameters. For add_label: { label_id: string }. For send_notification: { title?, message?, priority? }."),
			}),
			execute: async (params): Promise<unknown> => {
				const stub = getMailboxStub(env, mailboxId);
				return (stub as any).createRule({
					id: crypto.randomUUID(),
					name: params.name,
					type: "static",
					enabled: params.enabled ? 1 : 0,
					match_all: params.match_all ? 1 : 0,
					conditions: JSON.stringify(params.conditions),
					agent_prompt: null,
					action_type: params.action_type,
					action_params: JSON.stringify(params.action_params),
				});
			},
		}),

		create_agent_rule: defineTool({
			description:
				"Create an AI-evaluated rule. The agent uses natural language to judge whether an email matches the user's intent. This is more flexible than static rules but costs one AI inference per inbound email. Example: 'Notify me when emails from my kids kindergarten arrive'.",
			parameters: z.object({
				name: z.string().describe("A descriptive name for the rule"),
				enabled: z.boolean().default(true).describe("Whether the rule is active"),
				agent_prompt: z.string().describe("A natural language description of what emails should match this rule. Be specific. Example: 'This email is from my kids kindergarten and contains scheduling information.'"),
				action_type: z.enum(["add_label", "save_attachment", "send_notification"]).describe("What to do when the rule matches"),
				action_params: z.record(z.unknown()).describe("Action parameters. For add_label: { label_id: string }. For send_notification: { title?, message?, priority? }."),
			}),
			execute: async (params): Promise<unknown> => {
				const stub = getMailboxStub(env, mailboxId);
				return (stub as any).createRule({
					id: crypto.randomUUID(),
					name: params.name,
					type: "agent",
					enabled: params.enabled ? 1 : 0,
					match_all: 1,
					conditions: JSON.stringify([]),
					agent_prompt: params.agent_prompt,
					action_type: params.action_type,
					action_params: JSON.stringify(params.action_params),
				});
			},
		}),

		list_rules: defineTool({
			description: "List all automation rules for this mailbox, including both static and agent rules.",
			parameters: z.object({}),
			execute: async (): Promise<unknown> => {
				const stub = getMailboxStub(env, mailboxId);
				const rules = await (stub as any).getRules();
				return rules.map((rule: any) => ({
					...rule,
					conditions: JSON.parse(rule.conditions),
					action_params: JSON.parse(rule.action_params),
				}));
			},
		}),

		delete_rule: defineTool({
			description: "Delete an automation rule by its ID.",
			parameters: z.object({
				rule_id: z.string().describe("The ID of the rule to delete"),
			}),
			execute: async ({ rule_id }): Promise<unknown> => {
				const stub = getMailboxStub(env, mailboxId);
				await (stub as any).deleteRule(rule_id);
				return { status: "deleted", rule_id };
			},
		}),

		classify_email: defineTool({
			description: "Classify a single email using a natural language prompt. Returns true or false. Useful for ad-hoc classification without creating a rule.",
			parameters: z.object({
				emailId: z.string().describe("The email ID to classify"),
				prompt: z.string().describe("The natural language classification prompt. Example: 'Is this email an invoice?'"),
			}),
			execute: async ({ emailId, prompt }): Promise<unknown> => {
				const stub = getMailboxStub(env, mailboxId);
				const email = await (stub as any).getEmail(emailId);
				if (!email) return { error: "Email not found" };
				const result = await classifyEmail(env, email, prompt);
				return { result };
			},
		}),
	};
}

// Use `any` for the Env generic to avoid type conflicts between the custom
// SEND_EMAIL binding shape and the AIChatAgent constraint.  The actual env
// is fully typed inside the tools via the closure.
export class EmailAgent extends AIChatAgent<any> {
	async onChatMessage(onFinish: any) {
		const env = this.env as Env;
		const mailboxId = this.name;
		const workersai = createWorkersAI({ binding: env.AI });
		const tools = createEmailTools(env, mailboxId);
		const systemPrompt = await getSystemPrompt(env, mailboxId);

		const result = streamText({
			model: workersai("@cf/moonshotai/kimi-k2.5"),
			system: systemPrompt,
			messages: await convertToModelMessages(this.messages),
			tools,
			stopWhen: stepCountIs(5),
			onFinish,
		});

		return result.toUIMessageStreamResponse();
	}

}
