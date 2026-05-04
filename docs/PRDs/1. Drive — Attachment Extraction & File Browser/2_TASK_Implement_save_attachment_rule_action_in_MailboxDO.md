# Task 2: Implement save_attachment rule action in MailboxDO

## PRD Reference

- PRD title: Drive — Attachment Extraction & File Browser
- PRD file: `0_PRD_Drive_Attachment_Extraction_File_Browser.md`

## Objective

Extend the rule engine so that a rule with `action_type: "save_attachment"` automatically copies all attachments from a matching email into the Drive.

## Scope

- Add `case "save_attachment":` to `#executeRuleAction` in MailboxDO.
- Fetch attachment metadata for the email from the `attachments` table.
- Read each attachment blob from its existing R2 key (`attachments/{emailId}/{attId}/{filename}`).
- Write a copy to `drive/{mailboxId}/{driveFileId}/{filename}`.
- Call `createDriveFile` to persist metadata.
- If the email has no attachments, silently no-op.

## Out of Scope

- API routes (Task 3).
- Frontend code (Tasks 4–6).
- Rule condition for `has_attachment` (out of scope per PRD).
- Custom rename templates or action params.

## Implementation Notes

### R2 access inside MailboxDO
The MailboxDO constructor receives `env: Env`. Use `this.env.BUCKET` to read the original attachment blob and write the copy.

### Action execution flow
1. Query `attachments` table where `email_id = emailId`.
2. If no rows, return early.
3. For each attachment:
   - Generate `driveFileId = crypto.randomUUID()`.
   - Read blob from `attachments/{emailId}/{attachment.id}/{attachment.filename}`.
   - Write blob to `drive/{mailboxId}/{driveFileId}/{attachment.filename}`.
   - Call `createDriveFile(emailId, attachment, newR2Key)`.

### Error handling
If one attachment fails to copy, log the error and continue with the remaining attachments. Do not fail the entire rule execution.

## Acceptance Criteria

- [ ] Rule with `action_type: "save_attachment"` and `action_params: {}` executes without errors.
- [ ] Matching email with attachments creates one `drive_files` row per attachment.
- [ ] Matching email with no attachments silently does nothing.
- [ ] R2 objects exist at `drive/{mailboxId}/{driveFileId}/{filename}`.
- [ ] Partial failures (one attachment copy fails) do not block other attachments.

## Status

done

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
