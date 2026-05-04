# Task 5: Agent Rule Engine — Batched AI Evaluation

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Implement the evaluation and execution of agent rules using a single batched AI call per inbound email.

## Scope

- Update `MailboxDO.applyRules()` to:
  1. Evaluate all static rules first (existing logic + new classification support)
  2. Collect all enabled agent rules (`type = 'agent'`)
  3. If any agent rules exist, call `classifyEmailBatch()` with the email and all agent rule prompts
  4. Execute actions for matched agent rule IDs returned by the batch call
  5. Log every agent rule evaluation (matched and unmatched) to `rule_logs`
- Ensure agent rules are skipped if `agent_prompt` is empty/null
- Handle the case where the batched AI call fails (log error, skip all agent rules for this email)

## Out of Scope

- Partial batch execution (if one rule's prompt is bad, the whole batch fails — acceptable for v1)
- Agent rule priority/ordering
- Agent rule conditions (agent rules are purely prompt-based, no additional conditions)

## Implementation Notes

- Reuse `classifyEmailBatch()` from Task 2
- The batch prompt should present the email content once, then list all agent rules by ID and prompt, and ask the AI to return `{"matchedRuleIds": ["id1", "id2"]}`
- Agent rule execution follows the same action path as static rules (`#executeRuleAction()`)
- Log entries for agent rules should have `rule_type: 'agent'` and include the prompt and match status in `details`

## Acceptance Criteria

- [ ] Agent rules are evaluated in a single AI call per email
- [ ] Matched agent rules trigger their actions
- [ ] Unmatched agent rules are logged with `status: 'not_matched'`
- [ ] AI call failures are caught and logged, not thrown
- [ ] Agent rules respect the `enabled` flag
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
