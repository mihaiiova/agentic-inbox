# PRD: Email Orchestrator (v1)

## 1. Overview

Introduce an **Email Orchestrator** as the central decision-making layer for all inbound email processing in Agentic Inbox.

The orchestrator will:
- Normalize how decisions are made
- Produce a structured execution plan
- Execute actions in a controlled, traceable way
- Enable future extensibility (events, hooks, agent-driven planning)

This is an internal system (no UI required in v1), optimized for single-user (developer) usage.

---

## Task Status

| # | Task | Status | File |
|---|------|--------|------|
| 1 | Add execution_logs Database Migration | not started | `1_TASK_Add_execution_logs_Database_Migration.md` |
| 2 | Create Orchestrator Types and Context Builder | not started | `2_TASK_Create_Orchestrator_Types_and_Context_Builder.md` |
| 3 | Refactor Rule Evaluation into Pure Evaluator | not started | `3_TASK_Refactor_Rule_Evaluation_into_Pure_Evaluator.md` |
| 4 | Create Plan Generation Module | not started | `4_TASK_Create_Plan_Generation_Module.md` |
| 5 | Create Action Execution Module | not started | `5_TASK_Create_Action_Execution_Module.md` |
| 6 | Create Execution Logger | not started | `6_TASK_Create_Execution_Logger.md` |
| 7 | Create Orchestrator Entry Point | not started | `7_TASK_Create_Orchestrator_Entry_Point.md` |
| 8 | Integrate Orchestrator into MailboxDO and Remove Dead Code | not started | `8_TASK_Integrate_Orchestrator_into_MailboxDO_and_Remove_Dead_Code.md` |
| 9 | Write Orchestrator Tests | not started | `9_TASK_Write_Orchestrator_Tests.md` |

---

## 2. Goals

### Primary Goals
- Centralize all inbound email decision logic into one pipeline
- Replace fragmented logic (`applyRules`, etc.) with a plan → execute model
- Introduce full traceability of why an action happened
- Enable dry-run testing so developers can preview outcomes without side effects

### Secondary Goals
- Prepare the architecture for future event system and agent-driven planning
- Improve debugging and iteration speed when adding new automation behaviors
- Make the rule system more predictable and easier to extend

---

## 3. Non-Goals (v1)

- No UI for orchestration traces
- No user-defined hooks or DSL
- No multi-user configuration
- No external plugin system
- No changes to MCP or chat flows
- No agent-driven auto-draft (auto-draft trigger remains disabled; will be reintroduced later as a rule action)

---

## 4. Functional Requirements

### 4.1 Entry Point

All inbound emails MUST pass through the orchestrator after they are stored in `MailboxDO`.

```ts
await orchestrateEmail(ctx: OrchestratorContext, options?: { dryRun?: boolean })
```

Called from:
- `MailboxDO.createEmail()` — immediately after the email row and attachments are inserted, **inside** the Durable Object.

**Why inside MailboxDO?** Rules already run there, the email data is in memory, and it avoids an extra DO RPC round-trip.

---

### 4.2 Orchestrator Pipeline

The orchestrator follows a strict pipeline:

#### Step 1: Context Preparation
Input:
- `mailboxId`
- `email` (the stored record, including attachments)
- `mailboxSettings` (fetched from R2: `mailboxes/{mailboxId}.json`)
- `env`

Output:
- `OrchestratorContext` — a normalized context object ready for evaluation.

#### Step 2: Rule Evaluation

Use the existing rule evaluation logic, but **refactored** so it only evaluates and returns results — it does NOT execute actions.

Output:
```ts
ruleResults: Array<{
  ruleId: string
  ruleName: string
  ruleType: "static" | "agent"
  matched: boolean
  conditionResults?: Array<{ field?: string; operator: string; value: string; result: boolean }>
  actionType: string
  actionParams: Record<string, unknown>
}>
```

**Important:** The existing `rule_logs` table continues to record one row per rule evaluation. The orchestrator is responsible for writing these rows. This is a low-level audit trail.

#### Step 3: Plan Generation

Create a `Plan` object from the rule results.

**Plan Schema (v1):**
```ts
type Plan = {
  emailId: string
  actions: Action[]
  reasoning?: string
  confidence?: number
  sources: {
    rules: string[]   // IDs of rules that contributed actions
    agent?: boolean   // always false in v1; reserved for future
  }
}
```

**Action Schema (v1):**
```ts
type Action =
  | { type: "add_label"; params: { label_id: string } }
  | { type: "save_attachment"; params: {} }
  | { type: "send_notification"; params: { title?: string; message?: string; priority?: number } }
```

**Decision logic:**
- If one or more rules matched → the plan includes all actions from matched rules.
- If no rules matched → the plan has an empty `actions` array.
- The `reasoning` field is optional; in v1 it can be a simple string like "Matched rules: X, Y".

#### Step 4: Plan Execution

```ts
await executePlan(plan: Plan, ctx: OrchestratorContext)
```

Responsibilities:
- Execute actions sequentially in the order they appear in the plan.
- Call existing functions in `workers/lib/tools.ts` or equivalent internal helpers.
- Capture the result (success or failure) of each action.

**Error handling:**
- Actions execute sequentially.
- If an action throws, the error is caught, logged with `status: "failed"`, and execution **stops**.
- Prior successful actions are **not rolled back**.
- The overall plan is still recorded in `execution_logs`.

---

### 4.3 Dry Run Mode

If `options.dryRun === true`:
- Run Steps 1–3 (context preparation, rule evaluation, plan generation).
- **Skip Step 4** (plan execution).
- Return the `Plan` object.
- Do NOT write to `execution_logs` (or write with a `dryRun: true` flag if you prefer, but no side effects).

This allows developers to test rules without triggering notifications, labels, or drive writes.

---

### 4.4 Execution Logging (MANDATORY)

Every non-dry-run orchestration MUST persist an execution trace.

**Execution Log Schema:**
```ts
type ExecutionLog = {
  id: string
  emailId: string
  intent: { label: string; confidence: number }   // stub in v1: { label: "rules", confidence: 1.0 }
  rulesEvaluated: string[]   // rule IDs that were evaluated
  plan: Plan
  actionsExecuted: Array<{
    action: Action
    status: "success" | "failed"
    error?: string
  }>
  createdAt: string
}
```

Storage:
- **SQLite table `execution_logs`** inside `MailboxDO` (required).
- Do not rely on `console.log` as the primary store — logs must outlive the request.

**Relationship to `rule_logs`:**
- `rule_logs`: one row per rule evaluation (low-level audit, continues to exist unchanged).
- `execution_logs`: one row per email orchestration (high-level trace of the entire pipeline).
- Both tables coexist. The orchestrator writes to both.

---

## 5. Data Structures

### OrchestratorContext

```ts
type OrchestratorContext = {
  mailboxId: string
  email: EmailRecord
  mailboxSettings: Record<string, unknown>   // from R2: mailboxes/{mailboxId}.json
  env: Env
}
```

### EmailRecord

The shape of the email as stored in SQLite (same fields used by `applyRules` today):
```ts
type EmailRecord = {
  id: string
  subject: string
  sender: string
  recipient: string
  cc?: string | null
  bcc?: string | null
  date: string
  body: string
  folder_id: string
  in_reply_to?: string | null
  email_references?: string | null
  thread_id?: string | null
  message_id?: string | null
  raw_headers?: string | null
  read: boolean
  starred: boolean
}
```

---

## 6. Integration Points

### Modify: `MailboxDO.createEmail()`

After:
```ts
await this.db.insert(schema.emails).values(...)
if (attachments.length > 0) { ... }
```

Replace the existing `applyRules` call with:
```ts
if (folderId === Folders.INBOX) {
  const settings = await this.#getMailboxSettings(); // fetch from R2 or cache
  const ctx: OrchestratorContext = {
    mailboxId: this.ctx.id.toString(), // or however mailboxId is resolved
    email: { ...email, folder_id: folderId },
    mailboxSettings: settings,
    env: this.env,
  };
  await orchestrateEmail(ctx);
}
```

**Note:** The `applyRules` method on `MailboxDO` must be refactored so that it only evaluates rules and returns structured results. The action execution and logging moves into the orchestrator pipeline.

### Refactor: `MailboxDO.applyRules()`

- Remove direct calls to `#executeRuleAction()`.
- Remove direct calls to `#logRuleExecution()` (or keep them, but ensure the orchestrator also writes `execution_logs`).
- Return `ruleResults` array instead of void.
- The orchestrator calls `applyRules()`, receives the results, builds the `Plan`, and then executes.

---

## 7. File Structure

Create:

```
workers/orchestrator/
  index.ts           # exports orchestrateEmail
  context.ts         # OrchestratorContext, helpers to build context
  evaluate.ts        # refactored rule evaluation (extracted from MailboxDO)
  plan.ts            # Plan + Action types, plan generation logic
  execute.ts         # executePlan, action dispatch
  logger.ts          # ExecutionLog type, writeExecutionLog
```

Keep existing `workers/lib/classification.ts` as-is; import it from `evaluate.ts` for agent-rule classification.

---

## 8. Acceptance Criteria

- [ ] All inbound emails passing through `MailboxDO.createEmail()` go through `orchestrateEmail()`.
- [ ] `MailboxDO.applyRules()` returns structured results and does not directly execute actions.
- [ ] A `Plan` object is created for every inbound email.
- [ ] Actions execute via `executePlan()` using centralized dispatch.
- [ ] Dry-run mode works: plan is generated, no side effects occur.
- [ ] Execution logs are persisted to SQLite (`execution_logs` table).
- [ ] Existing `rule_logs` table continues to record rule-level audits.
- [ ] No regression in existing features: labels, notifications, attachment saving, rate limits.
- [ ] Auto-draft trigger code in `receiveEmail()` is fully removed (not just commented out).

---

## 9. Testing

### Required Tests

1. **Email with matching static rule:**
   - Plan includes `add_label` action.
   - Label is applied to email.
   - Execution log shows success.

2. **Email with matching agent rule:**
   - Batch classification runs.
   - Plan includes the matched rule's action.
   - Action executes.

3. **Email with no matching rules:**
   - Plan has empty `actions` array.
   - No side effects.
   - Execution log is still persisted.

4. **Dry run:**
   - `orchestrateEmail(ctx, { dryRun: true })` returns a plan.
   - No labels added, no notifications sent, no drive writes.

5. **Action failure:**
   - Simulate a failing action (e.g., invalid label_id).
   - First action succeeds, second action fails.
   - Execution stops at failure.
   - Execution log shows first as success, second as failed.

6. **Rule log continuity:**
   - After orchestration, `rule_logs` still contains one row per evaluated rule.

---

## 10. Future Extensions (Out of Scope)

- Event system (emit, on)
- User-defined hooks
- Agent-driven planning (agent contributes actions alongside rules)
- Parallel execution of independent actions
- UI visualization of execution traces
- `draft_reply` as a rule action (reintroducing auto-draft through the orchestrator)

---

## 11. Success Criteria

The system is considered successful when:
- A developer can inspect `execution_logs` and understand exactly why an action happened for any inbound email.
- Email processing behavior is predictable and reproducible.
- A new automation behavior can be added by modifying only the action dispatch table and the rule definition — not scattered across `applyRules`, `receiveEmail`, and `MailboxDO`.

---

## 12. Notes for Implementation Agent

- Reuse existing logic wherever possible: `classifyEmail`, `matchesStringCondition`, Pushover helpers, attachment saving.
- Do not introduce new external dependencies.
- Keep functions small and composable: one file per pipeline step.
- Prefer explicit data structures (`Plan`, `Action`, `ExecutionLog`) over implicit behavior.
- Logging is critical — do not skip. Persist to SQLite.
- Remove the commented-out auto-draft code in `receiveEmail()` entirely.
- Ensure the `execution_logs` table is created via the existing migration system (`workers/durableObject/migrations.ts`).
