# Task 9: Write Orchestrator Tests

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Add tests that verify the orchestrator pipeline behaves correctly across all specified scenarios.

## Scope

Create tests covering the 6 required test cases from PRD §9:

1. **Email with matching static rule** — plan includes action, action executes, log shows success.
2. **Email with matching agent rule** — batch classification runs, plan includes action, action executes.
3. **Email with no matching rules** — empty plan, no side effects, log still persisted.
4. **Dry run** — plan generated, no side effects, no log written.
5. **Action failure** — first action succeeds, second fails, execution stops, log captures both.
6. **Rule log continuity** — after orchestration, `rule_logs` contains one row per evaluated rule.

## Out of Scope

- UI tests.
- MCP or chat flow tests.

## Implementation Notes

- The project uses **Vitest** with `@cloudflare/vitest-pool-workers`.
- Tests should live in `tests/` or alongside the orchestrator in `workers/orchestrator/` — follow the project's convention.
- You will need to set up a test `MailboxDO` instance with the SQLite schema to test integration.
- Mock R2 reads for mailbox settings.
- Mock `classifyEmailBatch` for agent-rule tests.
- Mock Pushover notifications to avoid external API calls.
- Use `orchestrateEmail(ctx, { dryRun: true })` for dry-run tests.
- Assert on:
  - Return value (`Plan`)
  - Side effects (labels applied, drive files created, notifications sent)
  - `execution_logs` rows
  - `rule_logs` rows

## Acceptance Criteria

- [ ] All 6 test scenarios are implemented and passing.
- [ ] Tests run with `npm test` (or `vitest run`).
- [ ] No external API calls are made during tests.
- [ ] `npm run typecheck` passes.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
