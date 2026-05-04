# Task 1: Database Migration — Rule Types and Execution Logs

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Update the database schema to support agent rules, classification conditions, and rule execution logging.

## Scope

- Add `type` column (`'static' | 'agent'`) to the `rules` table with default `'static'`
- Add `agent_prompt` column (text, nullable) to the `rules` table
- Create new `rule_logs` table with columns:
  - `id` (text, primary key)
  - `email_id` (text, not null)
  - `rule_id` (text, nullable for future extensibility)
  - `rule_type` (text, `'static' | 'agent'`)
  - `action_type` (text)
  - `status` (text, `'matched' | 'not_matched' | 'success' | 'failed'`)
  - `details` (text, JSON blob)
  - `created_at` (text, default `datetime('now')`)
- Add Drizzle schema definitions in `workers/db/schema.ts`
- Add migration entry in `workers/durableObject/migrations.ts`

## Out of Scope

- Index optimization on `rule_logs` (basic table is sufficient for v1)
- Migration rollback logic

## Implementation Notes

- The migration must be idempotent (`IF NOT EXISTS` for columns where supported, or `ALTER TABLE` with column existence check)
- Default existing rules to `'static'` type
- `agent_prompt` should be nullable and ignored for static rules
- `rule_logs.rule_id` is nullable to allow logging agent-level decisions that don't map to a specific stored rule in the future

## Acceptance Criteria

- [ ] `rules` table has `type` and `agent_prompt` columns
- [ ] Existing rules default to `type = 'static'`
- [ ] `rule_logs` table is created with all required columns
- [ ] Drizzle schema reflects the new tables/columns
- [ ] Migration runs successfully and is idempotent
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
