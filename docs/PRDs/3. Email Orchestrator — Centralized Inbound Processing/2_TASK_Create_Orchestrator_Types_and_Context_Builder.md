# Task 2: Create Orchestrator Types and Context Builder

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Define all TypeScript types for the orchestrator pipeline and implement the context builder.

## Scope

- Create `workers/orchestrator/context.ts` containing:
  - `OrchestratorContext` type
  - `EmailRecord` type
  - A helper function `buildContext(mailboxId, email, env)` that fetches mailbox settings from R2 and assembles the context.

## Out of Scope

- Rule evaluation, plan generation, execution, or logging logic.

## Implementation Notes

- `OrchestratorContext` shape (PRD §5):
  ```ts
  type OrchestratorContext = {
    mailboxId: string
    email: EmailRecord
    mailboxSettings: Record<string, unknown>
    env: Env
  }
  ```
- `EmailRecord` should reuse the same field names as the existing SQLite `emails` table so it maps cleanly.
- The helper should read `mailboxes/{mailboxId}.json` from R2 (`env.BUCKET`).
- If the settings file is missing, default to `{}`.
- Export all types from `workers/orchestrator/index.ts` as well.

## Acceptance Criteria

- [ ] `workers/orchestrator/context.ts` exists with all types and helper.
- [ ] `buildContext` correctly fetches mailbox settings from R2.
- [ ] All types are exported.
- [ ] `npm run typecheck` passes.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
