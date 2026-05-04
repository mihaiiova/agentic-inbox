# Task 4: Static Rule Engine — Classification Condition Support

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Extend the existing static rule engine to support `classification` as a condition operator, integrating the Classification Skill.

## Scope

- Update `RuleCondition` type to allow `operator: "classification"` (field is ignored for classification conditions)
- Modify `MailboxDO.#evaluateRule()` to handle `classification` operator:
  - When `operator === "classification"`, call `classifyEmail()` with the email and the condition's `value` as the prompt
  - Cache classification results within a single rule evaluation to avoid duplicate AI calls if the same prompt appears twice
  - Combine classification results with other conditions using `match_all` (AND) / `match_any` (OR) logic
- Ensure `matchesCondition()` helper is updated or a new path is added for classification
- Update rule log creation to include classification prompts and results in `details`

## Out of Scope

- Batching classification conditions across multiple rules (each rule evaluates its own classifications)
- Caching classification results across emails

## Implementation Notes

- The `field` property is meaningless for `classification` conditions — it can be omitted or set to `"body"` by convention. The important field is `value` (the prompt).
- Classification conditions are inherently slower than string conditions. Evaluate string conditions first as a fast filter, and only call `classifyEmail()` if the string conditions pass (when `match_all` is true). This is a cheap optimization.
- For `match_any` rules with a classification condition, you may need to evaluate the classification even if string conditions fail, because the classification could be the matching condition.
- Log the prompt and the boolean result in `rule_logs.details` for transparency.

## Acceptance Criteria

- [ ] Static rules can have `classification` conditions
- [ ] `match_all` and `match_any` logic correctly combines classification results with string conditions
- [ ] Classification is only called when necessary (optimization for `match_all` rules)
- [ ] Rule logs include classification prompt and result in `details`
- [ ] Malformed conditions or AI failures default to `false` safely
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
