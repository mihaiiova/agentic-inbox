// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateRules } from "../workers/orchestrator/evaluate";
import { generatePlan } from "../workers/orchestrator/plan";
import { executePlan } from "../workers/orchestrator/execute";
import { orchestrateEmail } from "../workers/orchestrator";
import type { OrchestratorContext } from "../workers/orchestrator/context";
import type { RuleResult } from "../workers/orchestrator/evaluate";

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
			BUCKET: {
				head: vi.fn(),
				get: vi.fn(),
				put: vi.fn(),
				delete: vi.fn(),
				list: vi.fn(),
			} as any,
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

describe("evaluateRules", () => {
	it("matches static rule with contains condition", async () => {
		const ctx = makeCtx();
		const rules = [
			{
				id: "rule-1",
				name: "Test Rule",
				type: "static",
				enabled: 1,
				match_all: 0,
				conditions: JSON.stringify([{ field: "subject", operator: "contains", value: "Test" }]),
				agent_prompt: null,
				action_type: "add_label",
				action_params: JSON.stringify({ label_id: "important" }),
			},
		];
		const results = await evaluateRules(ctx, rules);
		expect(results).toHaveLength(1);
		expect(results[0].matched).toBe(true);
		expect(results[0].actionType).toBe("add_label");
	});

	it("does not match static rule when condition fails", async () => {
		const ctx = makeCtx();
		const rules = [
			{
				id: "rule-1",
				name: "Test Rule",
				type: "static",
				enabled: 1,
				match_all: 0,
				conditions: JSON.stringify([{ field: "subject", operator: "contains", value: "XYZ" }]),
				agent_prompt: null,
				action_type: "add_label",
				action_params: JSON.stringify({ label_id: "important" }),
			},
		];
		const results = await evaluateRules(ctx, rules);
		expect(results[0].matched).toBe(false);
	});

	it("returns empty results when no rules exist", async () => {
		const ctx = makeCtx();
		const results = await evaluateRules(ctx, []);
		expect(results).toHaveLength(0);
	});
});

describe("generatePlan", () => {
	it("creates plan with actions from matched rules", () => {
		const results: RuleResult[] = [
			{
				ruleId: "rule-1",
				ruleName: "Label invoices",
				ruleType: "static",
				matched: true,
				actionType: "add_label",
				actionParams: { label_id: "invoices" },
			},
		];
		const plan = generatePlan("email-1", results);
		expect(plan.emailId).toBe("email-1");
		expect(plan.actions).toHaveLength(1);
		expect(plan.actions[0].type).toBe("add_label");
		expect(plan.sources.rules).toContain("rule-1");
	});

	it("creates empty plan when no rules matched", () => {
		const results: RuleResult[] = [
			{
				ruleId: "rule-1",
				ruleName: "Test",
				ruleType: "static",
				matched: false,
				actionType: "add_label",
				actionParams: { label_id: "x" },
			},
		];
		const plan = generatePlan("email-1", results);
		expect(plan.actions).toHaveLength(0);
		expect(plan.reasoning).toBe("No rules matched");
	});
});

describe("executePlan", () => {
	it("executes add_label action successfully", async () => {
		const ctx = makeCtx();
		const plan = generatePlan("email-1", [
			{
				ruleId: "r1",
				ruleName: "Label",
				ruleType: "static",
				matched: true,
				actionType: "add_label",
				actionParams: { label_id: "l1" },
			},
		]);

		const insertMock = vi.fn().mockReturnValue({ values: () => ({ run: vi.fn() }) });
		const deps = {
			db: { insert: insertMock, select: vi.fn() as any },
			env: ctx.env,
		};

		const results = await executePlan(plan, ctx, deps);
		expect(results).toHaveLength(1);
		expect(results[0].status).toBe("success");
		expect(insertMock).toHaveBeenCalled();
	});

	it("stops execution on failure", async () => {
		const ctx = makeCtx();
		const plan = {
			emailId: "email-1",
			actions: [
				{ type: "add_label" as const, params: { label_id: "l1" } },
				{ type: "save_attachment" as const, params: {} },
			],
			sources: { rules: ["r1", "r2"] },
		};

		const insertMock = vi.fn().mockReturnValue({ values: () => ({ run: vi.fn() }) });
		const selectMock = vi.fn().mockImplementation(() => {
			return {
				from: () => ({
					where: () => ({
						all: () => {
							throw new Error("DB error");
						},
					}),
				}),
			};
		});
		const deps = {
			db: { insert: insertMock, select: selectMock },
			env: ctx.env,
		};

		const results = await executePlan(plan, ctx, deps);
		expect(results).toHaveLength(2);
		expect(results[0].status).toBe("success");
		expect(results[1].status).toBe("failed");
		expect(results[1].error).toBe("DB error");
	});
});

describe("orchestrateEmail", () => {
	it("returns plan without executing in dry run mode", async () => {
		const ctx = makeCtx();
		const rules = [
			{
				id: "rule-1",
				name: "Test Rule",
				type: "static",
				enabled: 1,
				match_all: 0,
				conditions: JSON.stringify([{ field: "subject", operator: "contains", value: "Test" }]),
				agent_prompt: null,
				action_type: "add_label",
				action_params: JSON.stringify({ label_id: "important" }),
			},
		];

		const insertMock = vi.fn().mockReturnValue({ values: () => ({ run: vi.fn() }) });
		const sqlExecMock = vi.fn();
		const deps = {
			db: { insert: insertMock, select: vi.fn() as any },
			sqlExec: sqlExecMock,
		};

		const plan = await orchestrateEmail(ctx, rules, deps, { dryRun: true });
		expect(plan.actions).toHaveLength(1);
		expect(insertMock).not.toHaveBeenCalled();
		expect(sqlExecMock).not.toHaveBeenCalled();
	});

	it("executes actions and logs execution in normal mode", async () => {
		const ctx = makeCtx();
		const rules = [
			{
				id: "rule-1",
				name: "Test Rule",
				type: "static",
				enabled: 1,
				match_all: 0,
				conditions: JSON.stringify([{ field: "subject", operator: "contains", value: "Test" }]),
				agent_prompt: null,
				action_type: "add_label",
				action_params: JSON.stringify({ label_id: "important" }),
			},
		];

		const insertMock = vi.fn().mockReturnValue({ values: () => ({ run: vi.fn() }) });
		const sqlExecMock = vi.fn();
		const deps = {
			db: { insert: insertMock, select: vi.fn() as any },
			sqlExec: sqlExecMock,
		};

		const plan = await orchestrateEmail(ctx, rules, deps);
		expect(plan.actions).toHaveLength(1);
		expect(insertMock).toHaveBeenCalled();
		expect(sqlExecMock).toHaveBeenCalled();
	});
});
