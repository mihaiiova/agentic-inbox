# Task 3: Refactor Rule Evaluation into Pure Evaluator

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Extract the rule evaluation logic from `MailboxDO` into a pure function that returns structured results without executing actions.

## Scope

- Create `workers/orchestrator/evaluate.ts` containing:
  - `evaluateRules(ctx)` — evaluates all rules for the given email and returns `RuleResult[]`.
  - Helper functions moved from `MailboxDO`: `matchesStringCondition`, `#evaluateStaticRule`, agent-rule batch classification.
- Refactor `MailboxDO.applyRules()` to:
  - Call the new evaluator.
  - Return `RuleResult[]` instead of void.
  - No longer call `#executeRuleAction()`.
  - Continue writing `rule_logs` rows (the orchestrator will also write `execution_logs`, but low-level rule audit must remain).

## Out of Scope

- Plan generation or action execution.
- Removing `rule_logs` writes.

## Implementation Notes

- `RuleResult` shape (PRD §4.2 Step 2):
  ```ts
  type RuleResult = {
    ruleId: string
    ruleName: string
    ruleType: "static" | "agent"
    matched: boolean
    conditionResults?: Array<{ field?: string; operator: string; value: string; result: boolean }>
    actionType: string
    actionParams: Record<string, unknown>
  }
  ```
- Move `matchesStringCondition` and the static-rule evaluation logic from `MailboxDO` into `evaluate.ts`.
- For agent rules, continue using `classifyEmailBatch` from `workers/lib/classification.ts`.
- `MailboxDO.applyRules()` should become a thin wrapper:
  ```ts
  async applyRules(email: EmailData): Promise<RuleResult[]> {
    const results = await evaluateRules({ ...ctx });
    for (const r of results) {
      await this.#logRuleExecution({ ... }); // keep existing behavior
    }
    return results;
  }
  ```
- Ensure existing tests (if any) or manual flows still work.

## Acceptance Criteria

- [ ] `workers/orchestrator/evaluate.ts` exists with pure rule evaluation.
- [ ] `MailboxDO.applyRules()` returns `RuleResult[]` and does not execute actions.
- [ ] `rule_logs` still receives one row per evaluated rule.
- [ ] Existing rule behavior is unchanged (labels, notifications, attachments still work via the orchestrator after Task 8).
- [ ] `npm run typecheck` passes.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
