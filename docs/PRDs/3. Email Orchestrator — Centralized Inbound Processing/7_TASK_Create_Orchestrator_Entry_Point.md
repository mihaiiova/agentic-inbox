# Task 7: Create Orchestrator Entry Point

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Implement the main `orchestrateEmail()` function that wires the entire pipeline together.

## Scope

- Create `workers/orchestrator/index.ts` containing:
  - `orchestrateEmail(ctx, options?)` — the main pipeline.
- The function orchestrates:
  1. Rule evaluation (via `evaluate.ts`)
  2. Plan generation (via `plan.ts`)
  3. Plan execution (via `execute.ts`) — skipped if `dryRun === true`
  4. Execution logging (via `logger.ts`) — skipped if `dryRun === true`

## Out of Scope

- Integration into `MailboxDO` (Task 8).
- Removing auto-draft dead code (Task 8).

## Implementation Notes

- Pipeline flow:
  ```ts
  export async function orchestrateEmail(
    ctx: OrchestratorContext,
    options?: { dryRun?: boolean }
  ): Promise<Plan> {
    const ruleResults = await evaluateRules(ctx);
    const plan = generatePlan(ctx.email.id, ruleResults);

    if (options?.dryRun) {
      return plan;
    }

    const actionsExecuted = await executePlan(plan, ctx);
    await writeExecutionLog(ctx, {
      id: crypto.randomUUID(),
      emailId: ctx.email.id,
      intent: { label: "rules", confidence: 1.0 },
      rulesEvaluated: ruleResults.map(r => r.ruleId),
      plan,
      actionsExecuted,
      createdAt: new Date().toISOString(),
    });

    return plan;
  }
  ```
- Re-export all public types from the orchestrator sub-modules.
- Keep the function composable and easy to test.

## Acceptance Criteria

- [ ] `workers/orchestrator/index.ts` exists with `orchestrateEmail`.
- [ ] The pipeline runs in correct order: evaluate → plan → (execute + log).
- [ ] Dry-run skips execution and logging.
- [ ] Returns the `Plan` in all cases.
- [ ] `npm run typecheck` passes.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
