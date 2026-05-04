# Task 1: Add execution_logs Database Migration

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Create the `execution_logs` SQLite table inside MailboxDO via the existing migration system so the orchestrator can persist execution traces.

## Scope

- Add a new migration to `workers/durableObject/migrations.ts` that creates the `execution_logs` table.
- Add the Drizzle schema definition for `execution_logs` to `workers/db/schema.ts`.

## Out of Scope

- Writing to the table (that happens in Task 6).
- Any changes to existing tables.

## Implementation Notes

The table schema (from PRD §4.4):

```sql
CREATE TABLE execution_logs (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL,
  intent TEXT NOT NULL,           -- JSON: { label, confidence }
  rules_evaluated TEXT NOT NULL,  -- JSON array of rule IDs
  plan TEXT NOT NULL,             -- JSON Plan object
  actions_executed TEXT NOT NULL, -- JSON array of { action, status, error? }
  created_at TEXT NOT NULL
);
```

- Follow the existing migration patterns in `mailboxMigrations`.
- Use the `txn()` wrapper for multi-statement migrations if needed.
- Keep migrations idempotent (`IF NOT EXISTS`).
- In `schema.ts`, define the Drizzle table with a JSON-friendly shape (store objects as text/json columns).

## Acceptance Criteria

- [ ] `execution_logs` table is defined in Drizzle schema.
- [ ] A migration exists that creates the table if it does not exist.
- [ ] `npm run typecheck` passes.
- [ ] Existing migrations are not broken.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
