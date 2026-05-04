// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { RuleResult } from "./evaluate";

export type Action =
	| { type: "add_label"; params: { label_id: string } }
	| { type: "save_attachment"; params: {} }
	| { type: "send_notification"; params: { title?: string; message?: string; priority?: number } };

export type Plan = {
	emailId: string;
	actions: Action[];
	reasoning?: string;
	confidence?: number;
	sources: {
		rules: string[];
		agent?: boolean;
	};
};

/**
 * Build a Plan from rule evaluation results.
 * Includes actions from all matched rules.
 */
export function generatePlan(emailId: string, ruleResults: RuleResult[]): Plan {
	const matchedRules = ruleResults.filter((r) => r.matched);
	const actions: Action[] = [];

	for (const rule of matchedRules) {
		switch (rule.actionType) {
			case "add_label": {
				const labelId = (rule.actionParams.label_id as string) || "";
				if (labelId) {
					actions.push({ type: "add_label", params: { label_id: labelId } });
				}
				break;
			}
			case "save_attachment": {
				actions.push({ type: "save_attachment", params: {} });
				break;
			}
			case "send_notification": {
				actions.push({
					type: "send_notification",
					params: {
						title: rule.actionParams.title as string | undefined,
						message: rule.actionParams.message as string | undefined,
						priority: rule.actionParams.priority as number | undefined,
					},
				});
				break;
			}
			default:
				console.warn(`Unknown action type in plan generation: ${rule.actionType}`);
		}
	}

	const ruleNames = matchedRules.map((r) => r.ruleName);
	return {
		emailId,
		actions,
		reasoning: matchedRules.length > 0 ? `Matched rules: ${ruleNames.join(", ")}` : "No rules matched",
		confidence: matchedRules.length > 0 ? 1.0 : 0,
		sources: {
			rules: matchedRules.map((r) => r.ruleId),
			agent: false,
		},
	};
}
