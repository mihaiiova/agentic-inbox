# Task 6: Update Rules UI to support save_attachment action type

## PRD Reference

- PRD title: Drive — Attachment Extraction & File Browser
- PRD file: `0_PRD_Drive_Attachment_Extraction_File_Browser.md`

## Objective

Allow users to select "Save attachments to Drive" as a rule action when creating or editing rules.

## Scope

- Extend the rule action type dropdown/selector in the Settings → Rules UI to include `save_attachment`.
- Display the action as "Save attachments to Drive" in the UI.
- Set `action_params` to `{}` when this action is selected.
- Ensure the rule list view shows a human-readable description for `save_attachment` rules.

## Out of Scope

- Adding `has_attachment` as a rule condition.
- Custom action params UI (rename templates, destination folders).
- Backend changes (covered by Tasks 1–3).

## Implementation Notes

### Action type options
Wherever rule action types are enumerated in the frontend (likely `app/routes/settings.tsx` or a sub-component), add:
```ts
{ value: "save_attachment", label: "Save attachments to Drive" }
```

### Rule form
When `action_type` is `save_attachment`, the action params form should show nothing (or a simple note: "All attachments from matching emails will be saved to Drive").

### Rule list display
In the rules list/table, render a friendly description like:
- `add_label` → "Add label: [Label Name]"
- `save_attachment` → "Save attachments to Drive"

### Types
Ensure `app/types/index.ts` is updated if the `Rule` type or `action_type` union is explicitly typed anywhere in the frontend.

## Acceptance Criteria

- [ ] Users can select "Save attachments to Drive" when creating a new rule.
- [ ] Users can change an existing rule's action to "Save attachments to Drive".
- [ ] Rule list shows "Save attachments to Drive" for rules using this action.
- [ ] Creating a `save_attachment` rule sends `action_params: {}` to the API.
- [ ] No console errors or type errors after the change.

## Status

done

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
