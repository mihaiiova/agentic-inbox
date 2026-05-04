# Task 1: Add drive_files table and MailboxDO CRUD methods

## PRD Reference

- PRD title: Drive — Attachment Extraction & File Browser
- PRD file: `0_PRD_Drive_Attachment_Extraction_File_Browser.md`

## Objective

Create the database schema and MailboxDO data access layer for Drive files, enabling storage, retrieval, and deletion of extracted attachment metadata.

## Scope

- Add a Durable Object migration to create the `drive_files` table.
- Add Drizzle schema definition for `drive_files`.
- Add MailboxDO methods: `createDriveFile`, `listDriveFiles`, `getDriveFile`, `deleteDriveFile`.
- Add filename sanitization utility shared with existing attachment storage.
- Ensure R2 key format is `drive/{mailboxId}/{driveFileId}/{filename}`.

## Out of Scope

- Rule engine integration (Task 2).
- API routes (Task 3).
- Frontend code (Tasks 4–6).
- R2 blob copy logic inside the rule action (Task 2).

## Implementation Notes

### Migration
Add a migration to `workers/durableObject/migrations.ts`:
```sql
CREATE TABLE drive_files (
  id TEXT PRIMARY KEY,
  email_id TEXT REFERENCES emails(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mimetype TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT datetime('now')
);
```

### Schema
Add `driveFiles` table to `workers/db/schema.ts` using `sqliteTable`.

### MailboxDO methods
- `createDriveFile(emailId, attachment, r2Key)` — inserts a row into `drive_files`.
- `listDriveFiles(page, limit)` — returns `{ files, totalCount }` ordered by `created_at DESC`.
- `getDriveFile(id)` — returns a single Drive file or null.
- `deleteDriveFile(id)` — deletes the SQLite row and returns the `r2_key` so the caller can delete the R2 object.

### Filename sanitization
Extract or reuse the sanitization regex from `workers/lib/attachments.ts` (`/[\/\\:*?"<>|\x00-\x1f]/g`) so Drive filenames are safe for R2 keys.

## Acceptance Criteria

- [ ] Migration runs successfully on existing DOs.
- [ ] `drive_files` table appears in the Drizzle schema.
- [ ] `listDriveFiles` returns results sorted by `created_at DESC`.
- [ ] `deleteDriveFile` removes the row from SQLite and returns the R2 key.
- [ ] Filename sanitization prevents path traversal in R2 keys.

## Status

done

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
