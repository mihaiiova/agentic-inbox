# Task 8: API Endpoints — Rule Logs and Updated Rule CRUD

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Update API routes to support the new rule fields and expose rule execution logs.

## Scope

- Update `POST /api/v1/mailboxes/:mailboxId/rules`:
  - Accept `type` (default `'static'`)
  - Accept `agent_prompt` (required when `type === 'agent'`)
  - Validate: if `type === 'agent'`, `agent_prompt` must be non-empty and `conditions` can be empty/null
  - Validate: if `type === 'static'`, `conditions` must be non-empty
- Update `PUT /api/v1/mailboxes/:mailboxId/rules/:id`:
  - Accept `type` and `agent_prompt` updates
- Add `GET /api/v1/mailboxes/:mailboxId/rule-logs`:
  - Query params: `?limit=` (default 50), `?page=` (default 1)
  - Returns array of log entries ordered by `created_at DESC`
- Update `app/services/api.ts` with new client methods
- Update `app/queries/` with TanStack Query hooks for rule logs

## Out of Scope

- Filtering rule logs by status or rule type
- Deleting rule logs
- WebSocket streaming of live rule logs

## Implementation Notes

- Reuse existing `intQuery()` helper for pagination params
- The rule logs endpoint should return the raw `details` JSON string — the frontend can parse it
- Update the `Rule` type in `app/types/index.ts` to include `type` and `agent_prompt`
- Update `useCreateRule` and `useUpdateRule` hooks to accept the new fields
- Create `useRuleLogs(mailboxId, page?, limit?)` query hook

## Acceptance Criteria

- [ ] `POST /rules` accepts `type` and `agent_prompt`
- [ ] `PUT /rules/:id` accepts `type` and `agent_prompt` updates
- [ ] `GET /rule-logs` returns paginated execution logs
- [ ] API client methods exist in `app/services/api.ts`
- [ ] TanStack Query hooks exist for rule logs
- [ ] Frontend types reflect the new rule fields
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
