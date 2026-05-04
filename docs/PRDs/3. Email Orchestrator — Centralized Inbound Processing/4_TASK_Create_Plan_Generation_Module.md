# Task 4: Create Plan Generation Module

## PRD Reference

- PRD title: Email Orchestrator (v1)
- PRD file: `PRD.md`

## Objective

Implement the plan builder that transforms rule evaluation results into a structured `Plan` object.

## Scope

- Create `workers/orchestrator/plan.ts` containing:
  - `Plan`, `Action` type definitions.
  - `generatePlan(emailId, ruleResults): Plan` function.

## Out of Scope

- Action execution.
- Intent classification beyond the stub.

## Implementation Notes

- `Plan` shape (PRD §4.2 Step 3):
  ```ts
  type Plan = {
    emailId: string
    actions: Action[]
    reasoning?: string
    confidence?: number
    sources: {
      rules: string[]
      agent?: boolean
    }
  }
  ```
- `Action` shape (v1):
  ```ts
  type Action =
    | { type: "add_label"; params: { label_id: string } }
    | { type: "save_attachment"; params: {} }
    | { type: "send_notification"; params: { title?: string; message?: string; priority?: number } }
  ```
- Decision logic:
  - Iterate over `ruleResults`.
  - For each `matched === true`, push the rule's `actionType` + `actionParams` as an `Action` into the plan.
  - Populate `sources.rules` with the IDs of matched rules.
  - Set `sources.agent` to `false` (stub for v1).
  - Set `reasoning` to a simple string like `"Matched rules: ${ruleNames.join(', ')}"`.
  - If no rules matched, return a plan with empty `actions`.
- Keep the function pure — no side effects.

## Acceptance Criteria

- [ ] `workers/orchestrator/plan.ts` exists with types and `generatePlan`.
- [ ] Matching rules produce a plan with corresponding actions.
- [ ] Non-matching rules do not add actions.
- [ ] Empty rule results produce an empty plan.
- [ ] `npm run typecheck` passes.

## Status

`not started`

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
