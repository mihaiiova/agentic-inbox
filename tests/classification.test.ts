// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { classifyEmail, classifyEmailBatch } from "../workers/lib/classification";
import { evaluateRules } from "../workers/orchestrator/evaluate";
import type { OrchestratorContext } from "../workers/orchestrator/context";

function makeCtx(overrides?: Partial<OrchestratorContext>): OrchestratorContext {
	return {
		mailboxId: "test@example.com",
		email: {
			id: "email-1",
			subject: "Test Subject",
			sender: "sender@example.com",
			recipient: "test@example.com",
			date: new Date().toISOString(),
			body: "Hello world",
			read: false,
			starred: false,
			...overrides?.email,
		},
		mailboxSettings: {},
		env: {
			BUCKET: {} as any,
			AI: {
				run: vi.fn(),
			} as any,
			EMAIL: {} as any,
			DOMAINS: "example.com",
			EMAIL_ADDRESSES: [],
			MAILBOX: {} as any,
			EMAIL_AGENT: {} as any,
			EMAIL_MCP: {} as any,
			POLICY_AUD: "",
			TEAM_DOMAIN: "",
			PUSHOVER_APP_TOKEN: "",
		},
	};
}

/**
 * Build a realistic forwarded invoice email body based on the user's screenshot.
 */
function buildForwardedInvoiceBody(): string {
	return `<div dir="ltr">
<br><br>
---------- Forwarded message ----------<br>
From: <strong>Google Payments</strong> &lt;<a href="mailto:payments-noreply@google.com">payments-noreply@google.com</a>&gt;<br>
Date: Sat, May 2, 2026 at 5:05 AM<br>
Subject: Google Cloud Platform &amp; APIs: Your invoice is available for 01FD09-2DC26E-2A8970<br>
To: &lt;<a href="mailto:mihai@datma.io">mihai@datma.io</a>&gt;<br>
<br><br>
<div style="text-align:center">
<img src="https://www.gstatic.com/images/branding/googlelogo/2x/google_cloud_color_188x64dp.png" alt="Google Cloud" width="188" height="64">
</div>
<br><br>
Your Google Cloud Platform &amp; APIs monthly invoice is available. Please find the PDF document attached at the bottom of this email.<br>
<br><br>
IMPORTANT: The balance will be automatically charged so you don't need to take any action.<br>
<br>
<table style="background:#f8f9fa;border-radius:12px;padding:16px">
<tr><td>Domain</td><td><strong>01FD09-2DC26E-2A8970</strong></td></tr>
<tr><td>Name</td><td><strong>Mighty Byte SRL</strong></td></tr>
<tr><td>Invoice number</td><td><strong>5561739274</strong></td></tr>
<tr><td>Payments profile ID</td><td><strong>4601-6174-7683</strong></td></tr>
</table>
<br><br>
</div>`;
}

describe("classifyEmailBatch - forwarded invoice scenario", () => {
	it("should match agent rule for forwarded invoice email", async () => {
		const ctx = makeCtx({
			email: {
				id: "email-1",
				subject: "Fwd: Google Cloud Platform & APIs: Your invoice is available for 01FD09-2DC26E-2A8970",
				sender: "mihai@datma.io",
				recipient: "mihai@iova.cloud",
				date: "2026-05-04T16:54:00Z",
				body: buildForwardedInvoiceBody(),
				read: false,
				starred: false,
			},
		});

		// Mock the AI to simulate what kimi-k2.5 *should* return for this email
		// But in the bug report, it returns matchedRuleIds: []
		const aiRun = vi.fn().mockResolvedValue({
			response: JSON.stringify({ matchedRuleIds: ["rule-invoice"] }),
		});
		ctx.env.AI.run = aiRun;

		const rules = [
			{
				id: "rule-invoice",
				name: "Save Invoice Attachments",
				type: "agent",
				enabled: 1,
				match_all: 0,
				conditions: "[]",
				agent_prompt: "email is an invoice or payment.",
				action_type: "save_attachment",
				action_params: "{}",
			},
		];

		const results = await evaluateRules(ctx, rules);
		expect(results).toHaveLength(1);
		expect(results[0].matched).toBe(true);

		// Verify the prompt sent to the AI
		expect(aiRun).toHaveBeenCalledTimes(1);
		const callArgs = aiRun.mock.calls[0];
		const userMessage = callArgs[1].messages.find((m: any) => m.role === "user")?.content || "";

		// The AI should see the invoice details in the body
		expect(userMessage).toContain("Invoice number");
		expect(userMessage).toContain("5561739274");
		expect(userMessage).toContain("Google Payments");
	});

	it("includes attachment metadata in the classification context", async () => {
		const ctx = makeCtx({
			email: {
				id: "email-1",
				subject: "Your invoice is available",
				sender: "payments-noreply@google.com",
				recipient: "test@example.com",
				date: "2026-05-04T16:54:00Z",
				body: "Your Google Cloud invoice is attached.",
				read: false,
				starred: false,
				attachments: [
					{ filename: "5561739274.pdf", mimetype: "application/pdf", size: 61700 },
				],
			},
		});

		const aiRun = vi.fn().mockResolvedValue({
			response: JSON.stringify({ matchedRuleIds: ["rule-invoice"] }),
		});
		ctx.env.AI.run = aiRun;

		const rules = [
			{
				id: "rule-invoice",
				name: "Save Invoice Attachments",
				type: "agent",
				enabled: 1,
				match_all: 0,
				conditions: "[]",
				agent_prompt: "email is an invoice or payment.",
				action_type: "save_attachment",
				action_params: "{}",
			},
		];

		const results = await evaluateRules(ctx, rules);
		expect(results[0].matched).toBe(true);

		const callArgs = aiRun.mock.calls[0];
		const userMessage = callArgs[1].messages.find((m: any) => m.role === "user")?.content || "";

		// The AI should see attachment metadata in the context
		expect(userMessage).toContain("ATTACHMENTS: 5561739274.pdf (application/pdf)");
	});

	it("logs the exact prompt when AI returns no match (reproducing the bug)", async () => {
		const ctx = makeCtx({
			email: {
				id: "email-1",
				subject: "Fwd: Google Cloud Platform & APIs: Your invoice is available for 01FD09-2DC26E-2A8970",
				sender: "mihai@datma.io",
				recipient: "mihai@iova.cloud",
				date: "2026-05-04T16:54:00Z",
				body: buildForwardedInvoiceBody(),
				read: false,
				starred: false,
			},
		});

		// Simulate the bug: AI returns empty matchedRuleIds for a forwarded invoice
		const aiRun = vi.fn().mockResolvedValue({
			response: JSON.stringify({ matchedRuleIds: [] }),
		});
		ctx.env.AI.run = aiRun;

		const rules = [
			{
				id: "rule-invoice",
				name: "Save Invoice Attachments",
				type: "agent",
				enabled: 1,
				match_all: 0,
				conditions: "[]",
				agent_prompt: "email is an invoice or payment.",
				action_type: "save_attachment",
				action_params: "{}",
			},
		];

		const results = await evaluateRules(ctx, rules);
		expect(results[0].matched).toBe(false);

		// Inspect what the AI actually saw
		const callArgs = aiRun.mock.calls[0];
		const userMessage = callArgs[1].messages.find((m: any) => m.role === "user")?.content || "";

		// This is the context the AI receives.
		// The FROM field shows the forwarder, not Google Payments.
		expect(userMessage).toContain("FROM: mihai@datma.io");
		expect(userMessage).not.toContain("FROM: Google Payments");

		// The body contains the original invoice info, but the AI might miss it
		expect(userMessage).toContain("Invoice number");
	});
});

	it("prompt instructs AI to consider forwarded content and attachments", async () => {
		const ctx = makeCtx();
		const aiRun = vi.fn().mockResolvedValue({
			response: JSON.stringify({ matchedRuleIds: [] }),
		});
		ctx.env.AI.run = aiRun;

		await classifyEmailBatch(ctx.env, { subject: "Test", sender: "test@test.com", body: "Hello" }, [
			{ ruleId: "r1", prompt: "email is an invoice" },
		]);

		const callArgs = aiRun.mock.calls[0];
		const systemMessage = callArgs[1].messages.find((m: any) => m.role === "system")?.content || "";

		expect(systemMessage).toContain("forwarded message");
		expect(systemMessage).toContain("attachments");
		expect(systemMessage).toContain("Be generous in matching");
	});

	describe("classifyEmail - single prompt behavior", () => {
	it("returns false when AI response is unparseable", async () => {
		const ctx = makeCtx();
		ctx.env.AI.run = vi.fn().mockResolvedValue({ response: "I think this is an invoice." });

		const result = await classifyEmail(ctx.env, {
			subject: "Invoice #123",
			sender: "billing@example.com",
			body: "Please pay this invoice.",
		}, "email is an invoice");

		expect(result).toBe(false);
	});

	it("returns true for explicit JSON response with true", async () => {
		const ctx = makeCtx();
		ctx.env.AI.run = vi.fn().mockResolvedValue({ response: '{"result": true}' });

		const result = await classifyEmail(ctx.env, {
			subject: "Invoice #123",
			sender: "billing@example.com",
			body: "Please pay this invoice.",
		}, "email is an invoice");

		expect(result).toBe(true);
	});
});
