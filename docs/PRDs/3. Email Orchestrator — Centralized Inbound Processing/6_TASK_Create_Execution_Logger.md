# Task 6: Create Execution Logger

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Implement the execution logger that persists orchestration traces to the `execution_logs` SQLite table.

## Scope

- Create `workers/orchestrator/logger.ts` containing:
  - `ExecutionLog` type.
  - `writeExecutionLog(ctx, logData)` function that inserts into SQLite.
- The logger must be called by the orchestrator entry point after plan execution.

## Out of Scope

- Dry-run logs (do not write in dry-run mode).
- Reading or querying execution logs.

## Implementation Notes

- `ExecutionLog` shape (PRD §4.4):
  ```ts
  type ExecutionLog = {
    id: string
    emailId: string
    intent: { label: string; confidence: number }
    rulesEvaluated: string[]
    plan: Plan
    actionsExecuted: Array<{ action: Action; status: "success" | "failed"; error?: string }>
    createdAt: string
  }
  ```
- In v1, `intent` is always `{ label: "rules", confidence: 1.0 }`.
- Store JSON fields as strings in SQLite (`intent`, `plan`, `actions_executed`).
- Use `crypto.randomUUID()` for the log ID.
- Use `new Date().toISOString()` for `createdAt`.
- The write function needs access to the MailboxDO's SQL interface. Pass the DO instance or a raw SQL executor into the logger.

## Acceptance Criteria

- [ ] `workers/orchestrator/logger.ts` exists with types and `writeExecutionLog`.
- [ ] Each non-dry-run orchestration writes one row to `execution_logs`.
- [ ] JSON columns are properly serialized.
- [ ] `npm run typecheck` passes.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
