# Task 6: Rule Execution Logging

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Implement comprehensive logging of all rule evaluations and action executions.

## Scope

- Create `MailboxDO` methods for rule log CRUD:
  - `logRuleExecution(logEntry)` — inserts a row into `rule_logs`
  - `getRuleLogs(limit?, offset?)` — returns recent logs ordered by `created_at DESC`
- Integrate logging into the rule evaluation flow:
  - Every static rule evaluation (matched or not) produces a log entry
  - Every agent rule evaluation (matched or not) produces a log entry
  - Every action execution (success or failure) updates the log entry or creates a follow-up entry
- Log `details` JSON should include:
  - For static rules: the full conditions array with individual condition results, `match_all` value
  - For classification conditions: the prompt and the boolean result
  - For agent rules: the `agent_prompt` and match status
  - For actions: action params, error message if failed, Pushover response if applicable
- Add API endpoint: `GET /api/v1/mailboxes/:mailboxId/rule-logs` (paginated, default last 50)

## Out of Scope

- Log filtering by rule type, status, or date range
- Log pruning/retention policy
- Real-time log streaming

## Implementation Notes

- Use Drizzle ORM for inserts and selects on `rule_logs`
- The `details` column stores a JSON string. Build the object in memory, then `JSON.stringify()` before insert.
- For action failures, create a separate log entry or update the existing one. Separate entries are simpler: one for evaluation (`matched`/`not_matched`), one for action execution (`success`/`failed`).
- Alternatively, use a single log entry per rule evaluation and update its status to `success`/`failed` after action execution. This is cleaner for the UI.
- API endpoint should accept `?limit=` and `?page=` query params (default limit 50, page 1).

## Acceptance Criteria

- [ ] Every rule evaluation (static + agent, matched + unmatched) is logged
- [ ] Action execution results are logged with status `success` or `failed`
- [ ] `details` JSON contains meaningful context for debugging
- [ ] `GET /api/v1/mailboxes/:mailboxId/rule-logs` returns paginated logs
- [ ] Logs are ordered newest first
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
