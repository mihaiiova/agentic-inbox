# Task 10: Frontend — Rule Logs Viewer

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Build a new settings tab that displays rule execution logs for transparency and debugging.

## Scope

- **Settings > Rule Logs tab** (new):
  - Table with columns: Timestamp, Email Subject (link to email), Rule Name, Type, Action, Status
  - Status rendered as colored badges (green for `success`, gray for `not_matched`, red for `failed`, blue for `matched`)
  - Clicking a row expands to show the `details` JSON in a readable format
  - Pagination controls (previous/next page)
  - Show a friendly empty state when no logs exist
  - Auto-refresh or manual refresh button

## Out of Scope

- Filtering by status, rule type, or date range
- Exporting logs to CSV/JSON
- Real-time live updates via WebSocket

## Implementation Notes

- Use the `useRuleLogs()` hook from Task 8
- The email subject may not be available in the log entry (only `email_id`). For v1, display the email ID as a link or fetch subjects in a separate query if needed.
- Parse `details` JSON and render it as a key-value list in the expanded view.
- For classification logs, prominently display the prompt and the boolean result.
- Use existing Kumo components (Table, Badge, Button, etc.) where available.

## Acceptance Criteria

- [ ] Rule Logs tab exists and is accessible from Settings
- [ ] Table displays timestamp, email reference, rule name, type, action, status
- [ ] Status badges use appropriate colors
- [ ] Expanded row shows readable `details` JSON
- [ ] Pagination works with previous/next buttons
- [ ] Empty state is shown when no logs exist
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
