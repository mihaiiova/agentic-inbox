# Task 7: Agent Tools for Rule Management

## PRD Reference

- PRD title: Agent Rules — Natural Language Email Automation
- PRD file: `0_PRD_Agent Rules — Natural Language Email Automation.md`

## Objective

Add agent tools so users can create, list, and delete rules via chat, plus a one-off classify utility.

## Scope

Add the following tools to `EmailAgent` (in `workers/agent/index.ts`):

1. **`create_static_rule`**
   - Parameters: `name`, `enabled`, `match_all`, `conditions` (array of `{ field, operator, value }`), `action_type`, `action_params`
   - Creates a rule in the database via `MailboxDO.createRule()`
   - Validates that at least one condition exists and action_type is valid

2. **`create_agent_rule`**
   - Parameters: `name`, `enabled`, `agent_prompt`, `action_type`, `action_params`
   - Creates an agent rule in the database
   - Validates that `agent_prompt` is non-empty

3. **`list_rules`**
   - No parameters (mailbox is implicit from context)
   - Returns all rules for the current mailbox with parsed JSON fields

4. **`delete_rule`**
   - Parameters: `rule_id`
   - Deletes the rule

5. **`classify_email`**
   - Parameters: `emailId`, `prompt`
   - Reads the email via `toolGetEmail`, calls `classifyEmail()`, returns `{ result: true | false }`
   - Useful for ad-hoc classification without creating a rule

## Out of Scope

- `update_rule` tool (users can delete and recreate for v1)
- Interactive clarifying questions before rule creation (v2)
- MCP exposure of these tools

## Implementation Notes

- Use `defineTool()` pattern already established in `EmailAgent`
- Call `getMailboxStub(env, mailboxId)` to get the DO stub for DB operations
- For `create_static_rule`, the agent may generate `classification` conditions. Make sure the tool schema allows `operator: "classification"`.
- **Critical: `match_all` defaults to `false` (OR logic)** in `create_static_rule` — this is the correct default for "contains X" type rules. Only use `true` when user explicitly wants AND logic.
- The tool description and system prompt should guide the agent to prefer single classification conditions for semantic matching (e.g. "does this email contain an invoice?") rather than multiple field checks.
- For `create_agent_rule`, store `type: 'agent'` and the prompt in `agent_prompt`.
- For `list_rules`, parse `conditions` and `action_params` from JSON strings before returning.
- Add `TOOL_LABELS` entries in `app/components/AgentPanel.tsx` for UI badges.

## Acceptance Criteria

- [ ] `create_static_rule` tool creates static rules with conditions and actions
- [ ] `create_agent_rule` tool creates agent rules with prompts
- [ ] `list_rules` returns all rules with parsed JSON
- [ ] `delete_rule` removes a rule
- [ ] `classify_email` returns a boolean for a given email and prompt
- [ ] All tools are registered in `EmailAgent` and have UI labels
- [ ] `npm run typecheck` passes

## Status

not started

## PRD Sync Requirement

When this task is created or its status changes, update the PRD `## Task Status` section.
