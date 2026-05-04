# Drive — Attachment Extraction & File Browser

## Problem Statement

Users receive emails containing important attachments (invoices, receipts, contracts, etc.) that they want to preserve and access independently of their email inbox. Currently, attachments are only accessible by opening the original email thread. There is no way to automatically extract attachments based on rules, nor to browse all extracted files in one place sorted by arrival date.

## Solution

Add a **Drive** feature that:
1. Allows users to create rules with a new `save_attachment` action.
2. Automatically copies matching email attachments into a mailbox-wide file store backed by R2.
3. Surfaces a dedicated **Drive** page in the app where all extracted files are listed in a flat, chronological view (most recent first).
4. Links each Drive file back to its source email so users retain full context.

## User Stories

1. As a user, I want to create a rule that says "from contains billing@acme.com → save attachments to Drive", so that all invoices I receive are automatically preserved without manual download.
2. As a user, I want to browse all extracted attachments in one flat list sorted by date (newest first), so that I can quickly find recent files.
3. As a user, I want to click on a Drive file and see which email it came from, so that I can read the original message for context or follow-up.
4. As a user, I want to download a file directly from the Drive view, so that I don't have to open the source email first.
5. As a user, I want to delete a file from Drive, so that I can clean up old or unwanted attachments.
6. As a user, I want Drive files to survive even if I delete the original email, so that my file archive is independent of my email lifecycle.
7. As a user, I want the rule to silently skip emails with no attachments, so that the rule doesn't fail or spam me with errors.

## Implementation Decisions

### Modules that will be built or modified
- **MailboxDO**: Add CRUD methods for a new `drive_files` SQLite table, and extend the rule engine with a `save_attachment` action handler.
- **R2 storage layer**: Add a new key prefix `drive/{mailboxId}/` for copied attachment blobs, independent of the existing `attachments/{emailId}/` prefix.
- **API layer**: Add three new endpoints for listing, downloading, and deleting Drive files.
- **Frontend routing**: Add a new `/mailboxes/:mailboxId/drive` route.
- **Frontend UI**: Build a Drive page with file list, download links, source-email references, and pagination.
- **Sidebar**: Add a Drive navigation item.
- **Rules UI**: Extend the action type dropdown to include `save_attachment`.
- **API client**: Add methods for the new Drive endpoints.
- **Database migration**: Add a Durable Object migration to create the `drive_files` table.

### Interface changes
- New TanStack Query hook: `useDriveFiles(mailboxId, page, limit)`.
- New API methods: `listDriveFiles`, `downloadDriveFile`, `deleteDriveFile`.
- New route: `mailboxes/:mailboxId/drive`.
- Rule action type enum expanded to include `"save_attachment"`.

### Technical clarifications
- The `save_attachment` action accepts an empty `action_params` object for the MVP. Future iterations may support rename templates or destination folders.
- The rule engine only applies rules to emails arriving in the Inbox, which is the existing behavior. The new action inherits this.
- When executing `save_attachment`, the rule engine reads attachment metadata from the `attachments` table, fetches the raw blob from the existing R2 key, writes it to a new `drive/{mailboxId}/{driveFileId}/{filename}` key, and inserts a `drive_files` row.
- If an email has multiple attachments, all are copied to Drive.

### Architectural decisions
- **Copy, don't move**: Attachments remain in their original location so existing email views are unaffected. Drive gets an independent copy.
- **Flat list, no folders**: The user explicitly requested sorting by date. Folder hierarchies are out of scope for the MVP.
- **No deduplication**: If the same file arrives twice, two Drive entries are created. This avoids content hashing complexity.
- **ON DELETE SET NULL**: If the source email is deleted, the Drive file remains but loses its `email_id` reference. The R2 blob is retained until the Drive file itself is deleted.

### Schema changes
- New table: `drive_files(id, email_id, filename, mimetype, size, r2_key, created_at)`.
- `email_id` is nullable (via `ON DELETE SET NULL`).
- `r2_key` is stored explicitly to enable R2 cleanup on Drive file deletion.

### API contracts
- `GET /api/v1/mailboxes/:mailboxId/drive?page=1&limit=25` → `{ files: DriveFile[], totalCount: number }`
- `GET /api/v1/mailboxes/:mailboxId/drive/:fileId/download` → `Blob` (streams from R2)
- `DELETE /api/v1/mailboxes/:mailboxId/drive/:fileId` → `204 No Content`
- Drive files are sorted by `created_at DESC` at the database level.

### Important interaction details
- The Drive page shows: filename, mimetype badge, human-readable size, relative date, and a link to the source email thread.
- Clicking a filename triggers a download.
- The sidebar Drive nav item has no unread badge — Drive is a passive archive, not an inbox.
- Download endpoint streams directly from R2 after validating the mailbox DO stub.

## Testing Decisions

- **End-to-end manual test**: Create a rule with `save_attachment`, forward an email with a PDF attachment, verify the file appears in the Drive page, verify download works, verify source email link navigates correctly, verify deleting the source email leaves the Drive file intact (with a broken link), verify deleting the Drive file removes the R2 object.
- **Unit test the rule engine** (if the project later adopts testing): mock the R2 bucket and assert that `save_attachment` copies the correct number of blobs and inserts the correct number of rows.
- **No existing test suite** in the repo, so validation is manual via `npm run dev`.

## Task Status

| Task # | Task Name | Status | Task File |
|--------|-----------|--------|-----------|
| 1 | Add drive_files table and MailboxDO CRUD methods | done | `1_TASK_Add_drive_files_table_and_MailboxDO_CRUD_methods.md` |
| 2 | Implement save_attachment rule action in MailboxDO | done | `2_TASK_Implement_save_attachment_rule_action_in_MailboxDO.md` |
| 3 | Add Drive API routes | done | `3_TASK_Add_Drive_API_routes.md` |
| 4 | Add frontend API service and query hooks for Drive | done | `4_TASK_Add_frontend_API_service_and_query_hooks_for_Drive.md` |
| 5 | Build Drive page with route and sidebar navigation | done | `5_TASK_Build_Drive_page_with_route_and_sidebar_navigation.md` |
| 6 | Update Rules UI to support save_attachment action type | done | `6_TASK_Update_Rules_UI_to_support_save_attachment_action_type.md` |

## Out of Scope

- Folder hierarchies or categories within Drive.
- Content-hash deduplication of identical files.
- Manual upload of files to Drive (non-email sources).
- Bulk download / zip generation.
- Search or filter within Drive (by filename, date range, mimetype).
- `has_attachment` as a standalone rule condition (only used implicitly by the `save_attachment` action).
- Custom rename templates or metadata extraction in `action_params`.
- OCR or preview generation for Drive files.
- Quotas or storage limits.

## Further Notes

- Filename sanitization should reuse the same regex used in the existing `storeAttachments()` helper to prevent path traversal in R2 keys.
- R2 keys are prefixed with `drive/{mailboxId}/` to ensure cross-mailbox isolation.
- The existing `attachments` table and `storeAttachments()` function are untouched — this feature adds a parallel storage path.
- Future iterations may want to add a `drive_folders` table if users request organization beyond a flat list.
- Consider adding an index on `drive_files(email_id)` if lookups by source email become common.
- The rule engine's `#executeRuleAction` method currently has no R2 access. The Drive action handler will need access to `this.env.BUCKET` inside the MailboxDO.
