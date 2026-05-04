// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export type { OrchestratorContext, EmailRecord } from "./context";
export { buildContext } from "./context";
export type { RuleResult } from "./evaluate";
export type { Plan, Action } from "./plan";
export type { ActionResult } from "./execute";
export type { ExecutionLog } from "./logger";

import { evaluateRules } from "./evaluate";
import { generatePlan } from "./plan";
import { executePlan } from "./execute";
import { writeExecutionLog } from "./logger";
import type { OrchestratorContext } from "./context";
import type { Plan } from "./plan";

type OrchestratorDeps = {
	db: {
		insert: (table: any) => { values: (vals: any) => { run: () => void } };
		select: (...args: any[]) => { from: (table: any) => { where: (cond: any) => { all: () => any[] } } };
	};
	sqlExec: (sql: string, ...params: unknown[]) => { [Symbol.iterator](): Iterator<unknown> };
};

/**
 * Central entry point for inbound email orchestration.
 *
 * Pipeline:
 * 1. Evaluate all rules
 * 2. Generate a plan from matched rules
 * 3. Execute actions (unless dryRun)
 * 4. Persist execution log (unless dryRun)
 */
export async function orchestrateEmail(
	ctx: OrchestratorContext,
	rules: Parameters<typeof evaluateRules>[1],
	deps: OrchestratorDeps,
	options?: { dryRun?: boolean },
): Promise<Plan> {
	const ruleResults = await evaluateRules(ctx, rules);
	const plan = generatePlan(ctx.email.id, ruleResults);

	if (options?.dryRun) {
		return plan;
	}

	const actionsExecuted = await executePlan(plan, ctx, { db: deps.db, env: ctx.env });

	await writeExecutionLog(
		{
			id: crypto.randomUUID(),
			emailId: ctx.email.id,
			intent: { label: "rules", confidence: 1.0 },
			rulesEvaluated: ruleResults.map((r) => r.ruleId),
			plan,
			actionsExecuted,
			createdAt: new Date().toISOString(),
		},
		{ sqlExec: deps.sqlExec },
	);

	return plan;
}
