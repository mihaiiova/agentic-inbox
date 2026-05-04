# Task 5: Build Drive page with route and sidebar navigation

## PRD Reference

- PRD title: Drive — Attachment Extraction & File Browser
- PRD file: `0_PRD_Drive_Attachment_Extraction_File_Browser.md`

## Objective

Create a dedicated Drive page where users can browse, download, and delete extracted attachments in a flat chronological list.

## Scope

- Add `mailboxes/:mailboxId/drive` route in `app/routes.ts`.
- Create `app/routes/drive.tsx` page component.
- Add Drive nav item to `app/components/Sidebar.tsx`.
- Implement file list UI: filename, mimetype badge, size, date, source email link, download button, delete button.
- Implement pagination controls.
- Handle empty state.

## Out of Scope

- Rules UI changes (Task 6).
- Search or filter within Drive.
- Bulk operations.

## Implementation Notes

### Route
```ts
// app/routes.ts
route("mailboxes/:mailboxId/drive", "routes/drive.tsx")
```

### Page layout
Use the existing `MailboxSplitView` or a full-width layout consistent with other pages.

### File list row
- **Filename**: clickable, triggers download via `URL.createObjectURL` on the fetched Blob.
- **Mimetype badge**: e.g. "PDF", "Image", "Other" derived from `mimetype`.
- **Size**: human-readable (reuse existing size formatting if available, otherwise simple KB/MB).
- **Date**: relative or formatted date (reuse `shared/dates.ts` utilities).
- **Source email**: if `email_id` exists, link to `/mailboxes/:mailboxId/emails/:emailId` or the thread view.
- **Actions**: download icon button, delete icon button with confirmation.

### Pagination
Reuse or mimic the pagination pattern from `email-list.tsx`.

### Empty state
Show a friendly message like "No files in Drive yet. Create a rule to automatically save attachments."

### Sidebar icon
Use `@phosphor-icons/react` `HardDrives` or `File` icon. Place below system folders.

## Acceptance Criteria

- [ ] Drive page loads at `/mailboxes/:mailboxId/drive`.
- [ ] Sidebar has a clickable Drive nav item.
- [ ] Files are listed in a flat table/card layout, newest first.
- [ ] Clicking a filename downloads the file.
- [ ] Source email link navigates to the email detail view.
- [ ] Delete button removes the file and refreshes the list.
- [ ] Empty state renders when no files exist.
- [ ] Pagination controls work correctly.

## Status

done

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
