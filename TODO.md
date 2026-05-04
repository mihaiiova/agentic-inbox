# TODOs — Agent Rules & Classification Improvements

## Classification Scope: Individual Email vs. Full Thread

**Current behavior:** Classification only sees the individual email that just arrived (subject, sender, body). It does NOT see the full thread history.

**Problem:** In some cases, the email itself is just "+1" or "Sounds good" but the thread context makes it important. Or a forwarded email's wrapper might dilute the signal.

**Open questions to decide:**
- Should agent rules have an option to evaluate against the full thread? (expensive — one thread fetch + larger prompt per email)
- Should static rules ever look at threads? (probably not — they should stay cheap)
- Should we include thread summary (e.g. last 2-3 messages) in the classification context by default?
- Cost/benefit: thread context adds ~500-2000 tokens per email, but could significantly improve accuracy for conversation-based rules

**Decision needed:** Start with just the individual email for v1, add thread context as an opt-in feature per rule in v2?

## Classification Model Quality

**Current:** `@cf/meta/llama-3.1-8b-instruct-fast` — fast but potentially inaccurate for nuanced classification.

**Issues observed:**
- Forwarded emails with clear invoice text not being classified correctly
- Model might struggle with structured/parsed HTML text vs. raw content

**Options to evaluate:**
- Try a more capable model (e.g. `@cf/moonshotai/kimi-k2.5` or `@cf/meta/llama-3.3-70b-instruct`)
- Test accuracy with a small benchmark set
- Consider temperature/prompt tuning

## Forwarded Email Handling

**Current:** We strip HTML and take the first 2000 chars of the plain text body.

**Problem:** Forwarded emails often have the important content at the BOTTOM (the original message), but we truncate from the TOP. This means the forwarded invoice content might get cut off.

**Fix to consider:**
- Truncate from the BOTTOM instead: `body.slice(-2000)` preserves the end of the email
- Or: detect "Begin forwarded message" / "---------- Forwarded message ----------" patterns and extract that section specifically
- Or: include both the beginning AND the end of the email if it's over 2000 chars

## Attachment Thread Walking

**Current:** `save_attachment` action only saves attachments from the current email. It does not look at other emails in the thread.

**Problem:** When a user forwards an email, the email client (Gmail, etc.) may strip the attachment. The forwarded email says "see attached invoice" but there is no attachment. The original email in the thread HAS the attachment, but we don't look for it.

**Feature idea:** If `save_attachment` finds no attachments on the current email, optionally walk the thread and save attachments from earlier emails that match the same subject/sender. This would be a rule-level setting or a fallback behavior.

**Open questions:**
- How far back in the thread should we look? (last 3 emails? all?)
- Should this be the default behavior or an opt-in per rule?
- What if the thread has multiple attachments from different emails — save all or just the most recent?

## Rule Debugging & Observability

**Current:** Rule logs show status and a JSON details blob.

**Gaps:**
- No way to see the actual prompt + email content that was sent to the AI classifier
- No way to manually re-run classification on an email to test a rule
- No classification confidence score (just true/false)

**Future improvements:**
- Log the full classification prompt and email context for debugging
- Add a "Test rule against this email" button in the UI
- Consider soft matches (confidence threshold) instead of hard boolean

## Agent Rule Creation Guidance

**Current:** The system prompt guides the agent to prefer single classification conditions with OR logic.

**Issue:** The agent might still create suboptimal rules depending on how the user phrases their request.

**Ideas:**
- After creating a rule, the agent could offer to test it against recent emails
- Show the user a preview of what the rule would match
- Allow natural language refinement: "make it catch forwarded invoices too"
