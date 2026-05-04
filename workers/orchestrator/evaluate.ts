// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { classifyEmail, classifyEmailBatch } from "../lib/classification";
import type { EmailRecord } from "./context";
import type { OrchestratorContext } from "./context";

export interface RuleCondition {
	field: "from" | "to" | "cc" | "subject" | "body";
	operator: "contains" | "equals" | "starts_with" | "ends_with" | "matches" | "classification";
	value: string;
}

export type RuleResult = {
	ruleId: string;
	ruleName: string;
	ruleType: "static" | "agent";
	matched: boolean;
	conditionResults?: Array<{ field?: string; operator: string; value: string; result: boolean }>;
	actionType: string;
	actionParams: Record<string, unknown>;
};

function getFieldValue(email: EmailRecord, field: RuleCondition["field"]): string {
	switch (field) {
		case "from":
			return email.sender || "";
		case "to":
			return email.recipient || "";
		case "cc":
			return email.cc || "";
		case "subject":
			return email.subject || "";
		case "body":
			return email.body || "";
		default:
			return "";
	}
}

function matchesStringCondition(email: EmailRecord, condition: RuleCondition): boolean {
	const fieldValue = getFieldValue(email, condition.field);
	if (!fieldValue) return false;

	const haystack = fieldValue.toLowerCase();
	const needle = condition.value.toLowerCase();

	switch (condition.operator) {
		case "contains":
			return haystack.includes(needle);
		case "equals":
			return haystack === needle;
		case "starts_with":
			return haystack.startsWith(needle);
		case "ends_with":
			return haystack.endsWith(needle);
		case "matches":
			try {
				return new RegExp(condition.value, "i").test(fieldValue);
			} catch {
				return false;
			}
		default:
			return false;
	}
}

async function evaluateStaticRule(
	email: EmailRecord,
	conditions: RuleCondition[],
	matchAll: boolean,
	env: OrchestratorContext["env"],
): Promise<{ matched: boolean; conditionResults: Array<{ field?: string; operator: string; value: string; result: boolean }> }> {
	if (conditions.length === 0) return { matched: true, conditionResults: [] };

	const conditionResults: Array<{ field?: string; operator: string; value: string; result: boolean }> = [];

	// Split into cheap string conditions and expensive classification conditions
	const stringConditions = conditions.filter((c) => c.operator !== "classification");
	const classificationConditions = conditions.filter((c) => c.operator === "classification");

	// Evaluate string conditions first
	for (const condition of stringConditions) {
		const result = matchesStringCondition(email, condition);
		conditionResults.push({
			field: condition.field,
			operator: condition.operator,
			value: condition.value,
			result,
		});
	}

	// Short-circuit optimizations
	if (matchAll) {
		// AND logic: if any string condition fails, the whole rule fails
		if (conditionResults.some((r) => !r.result)) {
			return { matched: false, conditionResults };
		}
		// All string conditions passed — now evaluate classification conditions
	} else {
		// OR logic: if any string condition passes, the whole rule passes
		if (conditionResults.some((r) => r.result)) {
			return { matched: true, conditionResults };
		}
		// No string condition passed — need classification conditions to save the rule
	}

	// Evaluate classification conditions with a per-rule cache
	const classificationCache = new Map<string, boolean>();
	for (const condition of classificationConditions) {
		const prompt = condition.value;
		let result = classificationCache.get(prompt);
		if (result === undefined) {
			result = await classifyEmail(env, email, prompt);
			classificationCache.set(prompt, result);
		}
		conditionResults.push({
			operator: "classification",
			value: prompt,
			result,
		});
		if (matchAll) {
			if (!result) return { matched: false, conditionResults }; // AND: one classification failed
		} else {
			if (result) return { matched: true, conditionResults }; // OR: one classification passed
		}
	}

	// If we get here:
	// - matchAll: all string conditions passed, all classification conditions passed
	// - matchAny: no string condition passed, no classification condition passed
	return { matched: matchAll, conditionResults };
}

/**
 * Evaluate all rules for a given email and return structured results.
 * Does NOT execute any actions — pure evaluation only.
 */
export async function evaluateRules(
	ctx: OrchestratorContext,
	rules: Array<{
		id: string;
		name: string;
		type: string;
		enabled: number;
		match_all: number;
		conditions: string;
		agent_prompt: string | null;
		action_type: string;
		action_params: string;
	}>,
): Promise<RuleResult[]> {
	const { email, env } = ctx;
	const results: RuleResult[] = [];

	// Evaluate static rules
	for (const rule of rules) {
		if (!rule.enabled) continue;
		if (rule.type === "agent") continue;
		try {
			const conditions = JSON.parse(rule.conditions) as RuleCondition[];
			const actionParams = JSON.parse(rule.action_params) as Record<string, unknown>;
			const { matched, conditionResults } = await evaluateStaticRule(email, conditions, !!rule.match_all, env);
			results.push({
				ruleId: rule.id,
				ruleName: rule.name,
				ruleType: "static",
				matched,
				conditionResults,
				actionType: rule.action_type,
				actionParams,
			});
		} catch (e) {
			console.warn(`Rule ${rule.id} evaluation failed:`, (e as Error).message);
			results.push({
				ruleId: rule.id,
				ruleName: rule.name,
				ruleType: "static",
				matched: false,
				actionType: rule.action_type,
				actionParams: JSON.parse(rule.action_params || "{}") as Record<string, unknown>,
			});
		}
	}

	// Evaluate agent rules in a single batch
	const agentRules = rules.filter((r) => r.enabled && r.type === "agent" && r.agent_prompt);
	if (agentRules.length > 0) {
		try {
			const prompts = agentRules.map((r) => ({ ruleId: r.id, prompt: r.agent_prompt! }));
			const matchedIds = await classifyEmailBatch(env, email, prompts);
			for (const rule of agentRules) {
				const matched = matchedIds.includes(rule.id);
				const actionParams = JSON.parse(rule.action_params) as Record<string, unknown>;
				results.push({
					ruleId: rule.id,
					ruleName: rule.name,
					ruleType: "agent",
					matched,
					actionType: rule.action_type,
					actionParams,
				});
			}
		} catch (e) {
			console.warn("Agent rule batch evaluation failed:", (e as Error).message);
			for (const rule of agentRules) {
				const actionParams = JSON.parse(rule.action_params) as Record<string, unknown>;
				results.push({
					ruleId: rule.id,
					ruleName: rule.name,
					ruleType: "agent",
					matched: false,
					actionType: rule.action_type,
					actionParams,
				});
			}
		}
	}

	return results;
}
