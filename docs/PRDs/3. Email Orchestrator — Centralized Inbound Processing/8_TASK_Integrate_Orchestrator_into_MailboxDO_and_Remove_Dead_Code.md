# Task 8: Integrate Orchestrator into MailboxDO and Remove Dead Code

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Wire the orchestrator into the inbound email flow and clean up dead auto-draft code.

## Scope

1. **Modify `MailboxDO.createEmail()`:**
   - After inserting the email and attachments, and after the existing `applyRules` call is refactored (Task 3), replace the direct `applyRules` invocation with a call to `orchestrateEmail()`.
   - Build the `OrchestratorContext` inside `createEmail()` and pass it to the orchestrator.
   - Keep the `folderId === Folders.INBOX` guard.

2. **Refactor `MailboxDO.applyRules()`:**
   - Ensure it uses the evaluator from Task 3.
   - Ensure it no longer calls `#executeRuleAction()`.
   - Ensure it still writes `rule_logs`.

3. **Remove auto-draft dead code:**
   - In `workers/index.ts` (`receiveEmail`), delete the commented-out block that triggers auto-draft on new email.
   - In `workers/agent/index.ts`, remove the `handleNewEmail` method and the `/onNewEmail` route handler if they are no longer called from anywhere.
   - If `handleNewEmail` is referenced elsewhere, leave it but remove the dead trigger in `receiveEmail`.

## Out of Scope

- Re-enabling auto-draft (future PRD).

## Implementation Notes

- The orchestrator runs **inside** `MailboxDO.createEmail()`, not in `receiveEmail()`.
- `createEmail()` already has the email data in memory — pass it directly into the context builder.
- Mailbox settings can be fetched from R2 (`env.BUCKET`) inside `createEmail()` or cached if already available.
- When deleting dead code, verify no other references exist via grep.

## Acceptance Criteria

- [ ] `MailboxDO.createEmail()` calls `orchestrateEmail()` for inbox emails.
- [ ] `MailboxDO.applyRules()` no longer executes actions.
- [ ] Auto-draft trigger code is fully removed from `receiveEmail()`.
- [ ] No orphaned auto-draft methods remain in the codebase (unless used elsewhere).
- [ ] `npm run typecheck` passes.
- [ ] Existing inbound email flow continues to work end-to-end.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
