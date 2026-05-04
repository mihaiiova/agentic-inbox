# Spec: Drive — Attachment Extraction & File Browser

## Overview
Add a **Drive** feature that lets users create rules to automatically extract email attachments into a mailbox-wide file store (backed by R2). The Drive is accessible from the app as a flat chronological list, sorted by date (recent first), with links back to the source emails.

## Motivating Example
> Forward emails with invoices to this app. Create a rule: `from contains "billing@acme.com"` → action `save_attachment`. All invoice PDFs appear in the Drive, newest first, with links back to the original emails.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drive scope | Mailbox-wide | Simplest mental model: one file store per mailbox. |
| Drive UI | Top-level page (`/mailboxes/:mailboxId/drive`) | First-class feature, not buried in settings. |
| Email reference | Store source email ID | Critical for invoice workflow — click through to original email. |
| Deduplication | None (store both copies) | Simplest, safest. Can add dedup later. |
| "Has attachment" check | Implicit in action | Rule only needs `from contains x` condition. Action no-ops if no attachments. |
| Organization | Flat chronological list | User explicitly asked for "sorted by date (recent first)". No folders for MVP. |
| Storage strategy | **Copy** blob to new R2 key | Drive files are independent of source email lifecycle. |
| Filename | Keep original exactly | Least surprising. Sorting is handled by DB timestamp. |

---

## Data Model

### New SQLite Table: `drive_files`

```sql
CREATE TABLE drive_files (
  id TEXT PRIMARY KEY,           -- UUID
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,        -- original filename, sanitized
  mimetype TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,          -- R2 object key: drive/{mailboxId}/{id}/{filename}
  created_at TEXT NOT NULL DEFAULT datetime('now')
);
```

Notes:
- `ON DELETE SET NULL` on `email_id` — if the source email is deleted, the Drive file remains but loses its link.
- `r2_key` is stored explicitly so we can clean up R2 objects later even if the source email is gone.

### R2 Storage Layout

```
attachments/{emailId}/{attId}/{filename}   # existing
mailboxes/{email}.json                     # existing

drive/{mailboxId}/{driveFileId}/{filename} # NEW — independent copy of attachment
```

---

## Rule Engine Changes

### New Action Type: `save_attachment`

```ts
// action_params is an empty object for MVP: {}
// Future: could add { rename_template: "{date}-{filename}", folder: "invoices" }
```

Behavior:
1. Only applies to emails in the **Inbox** (existing behavior — rules only run on incoming mail).
2. Checks if the email has any attachments.
3. If no attachments → silently no-op.
4. If attachments exist → for each attachment:
   - Copy the R2 blob from `attachments/{emailId}/{attId}/{filename}` to `drive/{mailboxId}/{driveFileId}/{filename}`.
   - Insert a `drive_files` row with `email_id` pointing to the source email.

### Rule condition expansion (future, out of scope for MVP)
- Add `has_attachment` as a rule condition field so users can create rules like "all emails with attachments → label as 'Files'".

---

## API Changes

### New Endpoints

```
GET    /api/v1/mailboxes/:mailboxId/drive
       Query params: page, limit (default 25, max 100)
       Returns: { files: DriveFile[], totalCount: number }

GET    /api/v1/mailboxes/:mailboxId/drive/:fileId/download
       Returns: Blob (streams from R2)

DELETE /api/v1/mailboxes/:mailboxId/drive/:fileId
       Deletes the DB row AND the R2 object
```

### DriveFile Type

```ts
interface DriveFile {
  id: string;
  email_id: string | null;
  filename: string;
  mimetype: string;
  size: number;
  created_at: string;
}
```

### Existing endpoint updates
- `POST /api/v1/mailboxes/:mailboxId/rules` — now accepts `action_type: "save_attachment"` with `action_params: {}`.

---

## MailboxDO Changes

### New methods

```ts
async createDriveFile(emailId: string, attachment: AttachmentData): Promise<DriveFile>
// Copies R2 blob, inserts row, returns DriveFile.

async listDriveFiles(page: number, limit: number): Promise<{ files: DriveFile[], totalCount: number }>
// SELECT * FROM drive_files ORDER BY created_at DESC LIMIT ? OFFSET ?

async getDriveFile(id: string): Promise<DriveFile | null>

async deleteDriveFile(id: string): Promise<boolean>
// DELETE row + delete R2 object via env.BUCKET.delete(r2_key)
```

### Rule engine update

In `#executeRuleAction`, add `case "save_attachment":`:
1. Fetch attachments for the email from `schema.attachments`.
2. If none, return.
3. For each attachment:
   - Read the R2 blob from `attachments/{emailId}/{attId}/{filename}`.
   - Generate `driveFileId = crypto.randomUUID()`.
   - Write to `drive/{mailboxId}/{driveFileId}/{filename}`.
   - Insert into `drive_files`.

---

## Frontend Changes

### New Route

```ts
// app/routes.ts
route("mailboxes/:mailboxId/drive", "routes/drive.tsx")
```

### New Page: `app/routes/drive.tsx`

- TanStack Query hook `useDriveFiles(mailboxId, page, limit)`.
- Flat list of files sorted by `created_at DESC` (handled by API).
- Each row shows: filename, mimetype, size, date, link to source email (if `email_id` exists).
- Click filename to download via `/api/v1/mailboxes/:mailboxId/drive/:fileId/download`.
- Delete button per file.

### Sidebar Update

Add a **Drive** nav item in the sidebar (below system folders) with a file icon (`@phosphor-icons/react` `File` or `HardDrives`).

### Settings → Rules UI Update

When creating/editing a rule, `action_type` dropdown gains a new option: **Save attachments to Drive** (`save_attachment`).

No additional params needed for MVP (empty JSON `{}`).

### API Client Update

```ts
// app/services/api.ts
listDriveFiles: (mailboxId: string, params: Record<string, string>) =>
  get<{ files: DriveFile[], totalCount: number }>(`/api/v1/mailboxes/${mailboxId}/drive`, { params }),

downloadDriveFile: (mailboxId: string, fileId: string) =>
  get<Blob>(`/api/v1/mailboxes/${mailboxId}/drive/${fileId}/download`, { responseType: "blob" }),

deleteDriveFile: (mailboxId: string, fileId: string) =>
  del<void>(`/api/v1/mailboxes/${mailboxId}/drive/${fileId}`),
```

---

## Migration

Add to `workers/durableObject/migrations.ts`:

```ts
{
  name: "0006_drive_files",
  sql: `CREATE TABLE drive_files (
    id TEXT PRIMARY KEY,
    email_id TEXT REFERENCES emails(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT datetime('now')
  );`,
}
```

---

## Security Considerations

- R2 keys use the mailbox ID prefix (`drive/{mailboxId}/...`) so different mailboxes cannot access each other's files.
- Download endpoint validates the mailbox DO stub before streaming the blob.
- Filename sanitization already exists in `storeAttachments()` — reuse or extract the same regex.

---

## Open Questions (for future iterations)

1. Should we allow bulk download (zip)?
2. Should we add search/filter in Drive (by filename, date range, mimetype)?
3. Should we support sub-folders/categories in Drive?
4. Should we deduplicate by content hash to save R2 space?
5. Should we allow manual upload to Drive (not just email extraction)?
6. Should we add a `has_attachment` rule condition for non-Drive use cases?

---

## Implementation Order (suggested)

1. **Backend**: Add migration + `drive_files` table + MailboxDO methods.
2. **Backend**: Add `save_attachment` rule action.
3. **Backend**: Add Drive API endpoints.
4. **Frontend**: Add Drive route, page, sidebar link, API hooks.
5. **Frontend**: Update Rules UI to support `save_attachment` action type.
6. **Test**: Create a rule, forward an email with an attachment, verify it appears in Drive.
