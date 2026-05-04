# Task 5: Create Action Execution Module

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Implement the centralized action executor that runs plan actions sequentially and captures results.

## Scope

- Create `workers/orchestrator/execute.ts` containing:
  - `executePlan(plan, ctx)` — executes actions sequentially.
  - Action dispatch functions for each action type (`add_label`, `save_attachment`, `send_notification`).

## Out of Scope

- Dry-run handling (the orchestrator entry point skips execution in dry-run mode).
- Writing execution logs (that happens in Task 6).

## Implementation Notes

- Reuse existing logic:
  - `add_label` → call `MailboxDO.addEmailLabel()` via the stub or direct DB access.
  - `save_attachment` → reuse the attachment-to-drive logic currently in `#executeRuleAction`.
  - `send_notification` → reuse `sendPushoverNotification` from `workers/lib/notifications.ts`.
- Error handling (PRD §4.2 Step 4):
  - Execute actions in order.
  - Wrap each action in `try/catch`.
  - On failure, record `status: "failed"` + error message, then **stop** execution.
  - Return an array of action results.
- The function should return:
  ```ts
  Array<{ action: Action; status: "success" | "failed"; error?: string }>
  ```
- Do not introduce new external dependencies.

## Acceptance Criteria

- [ ] `workers/orchestrator/execute.ts` exists with `executePlan`.
- [ ] Each action type dispatches to the correct existing implementation.
- [ ] Sequential execution works.
- [ ] Failure stops execution and captures the error.
- [ ] `npm run typecheck` passes.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
