# Task 3: Add Drive API routes

## PRD Reference

- PRD title: Drive — Attachment Extraction & File Browser
- PRD file: `0_PRD_Drive_Attachment_Extraction_File_Browser.md`

## Objective

Expose the Drive functionality via three new REST API endpoints mounted under the mailbox-scoped API path.

## Scope

- `GET /api/v1/mailboxes/:mailboxId/drive` — paginated list of Drive files.
- `GET /api/v1/mailboxes/:mailboxId/drive/:fileId/download` — stream blob from R2.
- `DELETE /api/v1/mailboxes/:mailboxId/drive/:fileId` — delete file row and R2 object.
- Add validation helpers for query params (`page`, `limit`).
- Reuse existing `requireMailbox` middleware.

## Out of Scope

- Frontend code (Tasks 4–6).
- Rule creation/validation logic (covered by existing rules endpoints).
- Authentication changes (Cloudflare Access JWT validation remains unchanged).

## Implementation Notes

### List endpoint
- Parse `page` and `limit` query params with safe defaults (page=1, limit=25, max 100).
- Call `mailboxDO.listDriveFiles(page, limit)`.
- Return `{ files: DriveFile[], totalCount: number }`.

### Download endpoint
- Call `mailboxDO.getDriveFile(fileId)`.
- If not found, return `404`.
- Use `env.BUCKET.get(r2_key)` to fetch the R2 object.
- Stream the object body with correct `Content-Type` and `Content-Disposition: attachment; filename="..."` headers.

### Delete endpoint
- Call `mailboxDO.deleteDriveFile(fileId)` to remove the SQLite row and get the `r2_key`.
- If row existed, call `env.BUCKET.delete(r2_key)`.
- Return `204 No Content`.

### Route placement
Add these routes in `workers/index.ts` under the existing mailbox-scoped router, after the rules routes.

## Acceptance Criteria

- [ ] `GET /api/v1/mailboxes/:mailboxId/drive` returns paginated Drive files sorted by date descending.
- [ ] `GET /api/v1/mailboxes/:mailboxId/drive/:fileId/download` streams the correct blob with proper headers.
- [ ] `DELETE /api/v1/mailboxes/:mailboxId/drive/:fileId` removes both the DB row and the R2 object.
- [ ] Invalid `page` / `limit` values are clamped to safe ranges.
- [ ] Non-existent file IDs return `404`.

## Status

done

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
