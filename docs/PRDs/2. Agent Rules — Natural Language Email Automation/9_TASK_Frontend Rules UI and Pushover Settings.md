# Task 9: Frontend — Rules UI and Pushover Settings

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Update the settings page to display rule types, support agent rules, and add Pushover configuration.

## Scope

- **Settings > Rules tab**:
  - Display rule type badge (`static` / `agent`) next to each rule
  - For agent rules, show the `agent_prompt` instead of conditions
  - For static rules with classification conditions, show the prompt inline with other conditions (e.g., "body: classification 'is this an invoice?'")
  - Rule creation form: add a toggle for rule type. When "agent" is selected, show a textarea for the prompt and hide the conditions builder.
  - Rule editing: same as creation
- **Settings > Notifications tab** (new or integrated into existing settings):
  - Input field for Pushover user key
  - Save to mailbox R2 settings
  - Link to Pushover signup

## Out of Scope

- Inline rule testing ("test this rule against an email")
- Drag-and-drop rule reordering
- Rich prompt editor for agent rules

## Implementation Notes

- The existing rules UI is in `app/routes/settings.tsx`. Extend it rather than replacing.
- Use existing Kumo design tokens and Phosphor icons.
- The Pushover user key input should be in the same settings form as other mailbox settings (forwarding, signature, system prompt) or in a new tab if the settings page gets too long.
- When creating an agent rule, `conditions` should be sent as an empty array or omitted.

## Acceptance Criteria

- [ ] Rules list shows `static` / `agent` type badges
- [ ] Agent rules display their natural language prompt
- [ ] Static rules with classification conditions display the classification prompt
- [ ] Rule creation form supports switching between static and agent types
- [ ] Pushover user key can be saved in mailbox settings
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
