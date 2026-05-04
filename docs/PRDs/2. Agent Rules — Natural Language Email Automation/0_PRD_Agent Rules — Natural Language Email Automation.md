# Agent Rules — Natural Language Email Automation

## Problem Statement

Users want to automate email processing through natural language instructions to the AI agent, rather than manually configuring rigid rule conditions in a settings form. Examples include:
- "If an email contains an invoice, save it in our storage"
- "Send me a notification for all emails from my kids' kindergarten"
- "If you find something important, send me a notification"

These instructions are semantic and intent-driven — they don't map cleanly to simple string-matching conditions. Users also want visibility and trust: they need to see what the agent decided, when, and why.

The existing static rule engine only supports deterministic field-based matching and lacks notification capabilities or execution auditing.

## Solution

Introduce **Agent Rules** alongside the existing static rule engine, plus a shared **Classification Skill** that evaluates an email against a natural language prompt and returns a boolean.

Users instruct the agent via chat, and the agent creates one of three things:

1. **Static Rules** — condition-based rules. Most conditions are cheap field matching (`from`, `subject`, `body`, etc.), but conditions can also use the **Classification Skill** (`operator: "classification"`) which calls Workers AI to evaluate the email against a prompt like *"is this an invoice?"* and returns `true`/`false`. This lets static rules mix cheap checks with smart AI checks in the same AND/OR logic.
2. **Agent Rules** — AI-evaluated rules where the *entire* rule is a natural language prompt. A single batched AI call evaluates all enabled agent rules against an email.
3. **Classification-only rules** — a convenience where the user just says "classify emails about X" and the agent creates a static rule with a single `classification` condition + an action.

Both rule types can trigger **Actions** (reusable units of behavior):
- `add_label`
- `save_attachment`
- `send_notification` (via Pushover)

Every rule execution is logged to an audit trail visible in the UI.

## User Stories

1. As a user, I want to tell the agent via chat "save invoice attachments to storage", so that I don't have to manually build a rule in settings.
2. As a user, I want the agent to create a rule that notifies me via Pushover when emails from my kids' kindergarten arrive, so that I never miss important communications.
3. As a user, I want a rule that says "if this email looks important, send me a notification", so that urgent emails don't get buried in my inbox.
4. As a user, I want to say "classify if an email is about sales spam and add a label", so that I can mix cheap static rules with AI-powered classification.
5. As a user, I want to see a log of which rules fired on which emails, so that I can debug and trust the automation.
6. As a user, I want to manage (view, enable/disable, delete) rules created by the agent, so that I stay in control of my automation.
7. As a user, I want both cheap static rules and smarter agent rules, so that I can choose the right tool for each job.
8. As a user, I want to configure my Pushover user key in mailbox settings, so that notification rules know where to send alerts.
9. As a user, I want static rules to support AI classification as a condition type, so that I can write rules like "if subject contains 'invoice' AND AI says it's a real bill, then save attachment".

## Implementation Decisions

### Classification Skill

A standalone, reusable module that takes an email and a natural language prompt, calls Workers AI, and returns a strict boolean:

```
classify(email: EmailData, prompt: string): Promise<boolean>
```

The AI is given a system prompt that forces a JSON response `{ "result": true | false }` with no extra commentary. The email's subject, sender, and body text are provided as context.

This skill is used in two places:
1. **Static rule conditions** — when a condition has `operator: "classification"`, the `value` field is treated as the prompt passed to `classify()`.
2. **Agent rule evaluation** — the batched evaluation uses the same underlying classification logic internally.

### Dual Rule Types

Extend the existing `rules` table with a `type` column (`'static' | 'agent'`):
- **Static rules** use the existing condition-based engine (`conditions` JSON array, `match_all` boolean). Conditions can mix cheap field checks (`from`, `subject`, `body`, etc.) with `classification` conditions that invoke the Classification Skill. Each classification condition costs one AI inference.
- **Agent rules** store a natural language `agent_prompt` (e.g., "This email is from my kids' kindergarten"). At email ingestion time, all enabled agent rule prompts are evaluated by Workers AI in a **single batched call** against the incoming email. The AI returns a JSON array of rule IDs that match. This is cheaper than one call per rule.

Both types share the same `action_type` and `action_params` columns.

### Condition Operators & Logic

Static rule conditions support these operators:
- `contains`, `equals`, `starts_with`, `ends_with`, `matches` — cheap string matching on `field`
- `classification` — invokes the Classification Skill with the condition `value` as the prompt

The `match_all` boolean controls how conditions are combined:
- `match_all: false` (OR) — **Default for agent-created rules.** Any single matching condition triggers the rule. Use this when the user says "contains X" or "is about X".
- `match_all: true` (AND) — All conditions must match. Use this only when the user explicitly says "must be X AND Y".

**Best practice for agent rule creation:** When a user says "if an email contains an invoice", the agent should create a single classification condition rather than multiple field checks:
```json
{
  "match_all": false,
  "conditions": [
    { "field": "body", "operator": "classification", "value": "does this email contain or refer to an invoice?" }
  ]
}
```
This is more reliable than checking `subject contains "invoice"` because invoices may not have that keyword in the subject line.

### Rule Evaluation Flow

When a new email arrives in the inbox:
1. Evaluate **static rules** first. For each rule:
   - Evaluate cheap field conditions synchronously.
   - For any `classification` conditions, call the Classification Skill. If multiple classification conditions exist in the same rule, they are evaluated **sequentially** (not batched) to keep the prompt simple and the boolean logic explicit.
   - Combine all condition results with `match_all` (AND) or `match_any` (OR).
   - If matched, execute the rule's action and log.
2. If any **agent rules** exist, make a single batched AI call with the email content and all enabled agent rule prompts. The AI returns a JSON array of rule IDs that match.
3. Execute actions for all matched agent rules and log.
4. Log every execution attempt (matched or not) to `rule_logs`.

### Pushover Integration

- `PUSHOVER_APP_TOKEN` is an environment variable (one per deployment, configured in `wrangler.jsonc`).
- The Pushover **user key** is stored per-mailbox in R2 settings (`pushoverUserKey` field in `MailboxSettings`).
- The `send_notification` action accepts optional overrides in `action_params`:
  - `pushover_user_key` — override the mailbox default
  - `title` — custom notification title (defaults to email subject)
  - `message` — custom message body (defaults to a summary)
  - `priority` — Pushover priority (-2 to 2)

### Agent Tools for Rule Management

Add the following tools to `EmailAgent`:
- `create_static_rule` — creates a deterministic rule with conditions and an action. The agent can include `classification` conditions in the `conditions` array.
- `create_agent_rule` — creates an AI-evaluated rule with a natural language prompt and an action
- `list_rules` — returns all rules for the mailbox
- `delete_rule` — removes a rule by ID
- `classify_email` — one-off utility. Takes an `emailId` and a `prompt`, returns `true`/`false`. Useful for ad-hoc classification without creating a rule.

For v1, the agent parses user intent directly and creates rules without interactive back-and-forth clarification. If the agent is uncertain, it makes its best attempt and informs the user. Interactive clarifying questions are deferred to v2.

### Rule Execution Logging

New `rule_logs` table:
- `id` — primary key
- `email_id` — the email being processed
- `rule_id` — the rule that was evaluated (nullable for future extensibility)
- `rule_type` — `'static' | 'agent'`
- `action_type` — the action attempted
- `status` — `'matched' | 'not_matched' | 'success' | 'failed'`
- `details` — JSON blob with context (e.g., matched conditions, error message, Pushover response)
- `created_at` — timestamp

Logs are written during `applyRules()` execution for every rule evaluated, not just the ones that match.

### Frontend Changes

- **Settings > Rules**: Extend the existing rules section to display the rule type (`static` vs `agent`). Agent rules show their natural language prompt instead of conditions.
- **Settings > Rule Logs** (new tab): Display recent rule executions in a table with columns: timestamp, email subject, rule name, type, action, status. Clicking a row expands the `details` JSON.
- **Settings > Notifications** (new tab or integrated): Input field for Pushover user key per mailbox.

### API Changes

- Extend existing rule CRUD endpoints (`POST /rules`, `PUT /rules/:id`) to accept `type` and `agent_prompt` fields.
- New endpoint: `GET /api/v1/mailboxes/:mailboxId/rule-logs` — returns recent rule execution logs (paginated, default last 50).

### Mailbox Settings

Add `pushoverUserKey?: string` to the `MailboxSettings` interface and R2-stored JSON.

## Testing Decisions

- **Static rule evaluation**: Test edge cases (empty conditions, `match_all` vs `match_any`, malformed JSON gracefully handled).
- **Classification skill**: Mock the AI response to verify `classify()` returns strict booleans. Test that malformed AI responses default to `false` safely.
- **Static rule with classification condition**: Test a rule that mixes `subject contains` with `body classification`, verifying that the classification result is correctly ANDed/ORed with cheap conditions.
- **Agent rule batch evaluation**: Mock the AI response to verify the correct rule IDs are returned and actions are triggered.
- **Pushover action**: Mock `fetch` to `api.pushover.net` and verify payload structure, error handling, and fallback to mailbox settings.
- **Rule log creation**: Assert that logs are written for both matched and unmatched rules, and for success and failure paths. Verify classification conditions log the prompt and result in `details`.
- **Agent tools**: Test `create_static_rule`, `create_agent_rule`, and `classify_email` tool parameter validation and database persistence.
- **End-to-end**: Send a test email, verify that a matching static rule (with classification), a matching agent rule, and a non-matching rule all produce correct logs and actions in the UI.

## Task Status

| Task | Name | Status | File |
|------|------|--------|------|
| 1 | Database Migration — Rule Types and Execution Logs | done | `1_TASK_Database Migration.md` |
| 2 | Classification Skill Module | done | `2_TASK_Classification Skill Module.md` |
| 3 | Pushover Integration and Notification Action | done | `3_TASK_Pushover Integration.md` |
| 4 | Static Rule Engine — Classification Condition Support | done | `4_TASK_Static Rule Classification Condition.md` |
| 5 | Agent Rule Engine — Batched AI Evaluation | done | `5_TASK_Agent Rule Engine.md` |
| 6 | Rule Execution Logging | done | `6_TASK_Rule Execution Logging.md` |
| 7 | Agent Tools for Rule Management | done | `7_TASK_Agent Tools for Rule Management.md` |
| 8 | API Endpoints — Rule Logs and Updated Rule CRUD | done | `8_TASK_API Endpoints.md` |
| 9 | Frontend — Rules UI and Pushover Settings | done | `9_TASK_Frontend Rules UI and Pushover Settings.md` |
| 10 | Frontend — Rule Logs Viewer | done | `10_TASK_Frontend Rule Logs Viewer.md` |

## Out of Scope

- Interactive clarifying questions from the agent during rule creation (v2)
- Webhook or Slack/Telegram notifications beyond Pushover
- In-app notification toasts or bell icon
- Rate limiting on agent rule AI evaluation
- Rule log filtering, search, or advanced pagination (basic list is sufficient for v1)
- Editing agent rules via natural language ("change my kindergarten rule to also include...")

## Further Notes

- **Cost**: Agent rule evaluation adds one AI inference call per inbound email if any agent rules are enabled. For mailboxes with no agent rules, there is zero additional cost. Consider documenting this clearly for users.
- **Pushover limits**: The free Pushover plan allows 7,500 messages/month. Users with high email volume should be aware.
- **Prompt injection**: Agent rule prompts are user-controlled (created by the agent on behalf of the user). The batched evaluation prompt should be structured to minimize the risk of an email body manipulating the evaluation. Consider a system prompt that treats the email content as untrusted data.
- **Backward compatibility**: Existing static rules in the database have no `type` column. The migration should default them to `'static'`.
