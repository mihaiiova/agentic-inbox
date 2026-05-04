// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Plan, Action } from "./plan";
import type { ActionResult } from "./execute";

export type ExecutionLog = {
	id: string;
	emailId: string;
	intent: { label: string; confidence: number };
	rulesEvaluated: string[];
	plan: Plan;
	actionsExecuted: Array<{
		action: Action;
		status: "success" | "failed";
		error?: string;
	}>;
	createdAt: string;
};

type LoggerDeps = {
	sqlExec: (sql: string, ...params: unknown[]) => { [Symbol.iterator](): Iterator<unknown> };
};

/**
 * Persist an execution trace to the execution_logs table.
 */
export async function writeExecutionLog(
	log: ExecutionLog,
	deps: LoggerDeps,
): Promise<void> {
	try {
		deps.sqlExec(
			`INSERT INTO execution_logs (id, email_id, intent, rules_evaluated, plan, actions_executed, created_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
			log.id,
			log.emailId,
			JSON.stringify(log.intent),
			JSON.stringify(log.rulesEvaluated),
			JSON.stringify(log.plan),
			JSON.stringify(log.actionsExecuted),
			log.createdAt,
		);
	} catch (e) {
		console.warn("Failed to write execution log:", (e as Error).message);
	}
}
