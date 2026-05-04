# Task 3: Pushover Integration and Notification Action

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Implement the `send_notification` action that delivers notifications via Pushover.

## Scope

- Add `PUSHOVER_APP_TOKEN` to environment bindings (`wrangler.jsonc`, `workers/types.ts`)
- Add `pushoverUserKey?: string` to `MailboxSettings` interface
- Create `workers/lib/notifications.ts` with `sendPushoverNotification()` function
- Implement the `send_notification` action in `MailboxDO.#executeRuleAction()`:
  - Read `pushoverUserKey` from mailbox R2 settings (fallback)
  - Allow override via `action_params.pushover_user_key`
  - Support optional `title`, `message`, `priority` in `action_params`
  - POST to `https://api.pushover.net/1/messages.json`
  - Return success/failure for logging
- Handle Pushover API errors gracefully (log warning, don't crash rule execution)

## Out of Scope

- Other notification providers (Slack, Telegram, webhooks)
- In-app notification UI (toasts, bell icon)
- Pushover receipt/acknowledgment features

## Implementation Notes

- The Pushover app token is global (one per deployment). The user key is per-mailbox.
- Default notification title = email subject. Default message = a short summary like "New email from {sender}".
- Use `fetch()` directly. No external HTTP client needed.
- If `pushoverUserKey` is missing from both settings and action params, the action should fail with a clear error logged.
- Add the `send_notification` case to the switch statement in `#executeRuleAction()` alongside existing `add_label` and `save_attachment`.

## Acceptance Criteria

- [ ] `PUSHOVER_APP_TOKEN` is declared in env types and wrangler config
- [ ] `MailboxSettings` includes `pushoverUserKey`
- [ ] `send_notification` action sends a POST to Pushover API with correct payload
- [ ] Action falls back to mailbox settings for user key
- [ ] Action supports override params (`pushover_user_key`, `title`, `message`, `priority`)
- [ ] Pushover errors are caught and logged, not thrown
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
