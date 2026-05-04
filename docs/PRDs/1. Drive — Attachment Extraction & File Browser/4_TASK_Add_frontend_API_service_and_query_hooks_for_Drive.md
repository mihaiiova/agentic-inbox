# Task 4: Add frontend API service and query hooks for Drive

## PRD Reference

- PRD title: Drive — Attachment Extraction & File Browser
- PRD file: `0_PRD_Drive_Attachment_Extraction_File_Browser.md`

## Objective

Connect the frontend to the Drive API by extending the API client and adding TanStack Query hooks.

## Scope

- Extend `app/services/api.ts` with three new methods:
  - `listDriveFiles`
  - `downloadDriveFile`
  - `deleteDriveFile`
- Add `DriveFile` type to `app/types/index.ts`.
- Create `app/queries/drive.ts` with:
  - `useDriveFiles(mailboxId, page, limit)`
  - `useDeleteDriveFile()` mutation with cache invalidation.

## Out of Scope

- UI components or pages (Tasks 5–6).
- Rules UI changes (Task 6).

## Implementation Notes

### API client methods
```ts
listDriveFiles: (mailboxId: string, params: Record<string, string>) =>
  get<{ files: DriveFile[], totalCount: number }>(`/api/v1/mailboxes/${mailboxId}/drive`, { params }),

downloadDriveFile: (mailboxId: string, fileId: string) =>
  get<Blob>(`/api/v1/mailboxes/${mailboxId}/drive/${fileId}/download`, { responseType: "blob" }),

deleteDriveFile: (mailboxId: string, fileId: string) =>
  del<void>(`/api/v1/mailboxes/${mailboxId}/drive/${fileId}`),
```

### Type definition
```ts
export interface DriveFile {
  id: string;
  email_id: string | null;
  filename: string;
  mimetype: string;
  size: number;
  created_at: string;
}
```

### Query hooks
- `useDriveFiles` should use `queryKeys.drive.list(mailboxId, page, limit)`.
- `useDeleteDriveFile` should invalidate the drive list query on success.

### Query keys
Add drive-related keys to `app/queries/keys.ts`.

## Acceptance Criteria

- [ ] `listDriveFiles` returns typed `{ files, totalCount }`.
- [ ] `downloadDriveFile` fetches a `Blob`.
- [ ] `deleteDriveFile` returns `void` on success.
- [ ] `useDriveFiles` caches per `(mailboxId, page, limit)`.
- [ ] `useDeleteDriveFile` invalidates the Drive list cache after deletion.

## Status

done

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
