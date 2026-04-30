# Agentic Inbox — Design Document

> High-level architecture, data model, and design decisions for Agentic Inbox.

## Overview

Agentic Inbox is a serverless email client that runs entirely on Cloudflare's edge infrastructure. Each mailbox is an isolated Durable Object with its own SQLite database. Attachments are stored in R2. The frontend is a React SPA served from the same Worker that hosts the API.

## Design Goals

1. **Zero infrastructure** — runs entirely on Cloudflare (Workers, DO, R2, Email Routing).
2. **Per-mailbox isolation** — each mailbox is a separate DO with its own SQLite DB.
3. **AI-native** — built-in agent that can read, search, draft, and organize emails.
4. **Secure by default** — Cloudflare Access is the single trust boundary; fail-closed auth.
5. **Extensible** — MCP server allows external AI tools to operate on mailboxes.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
                            │
                            ▼
                     ┌─────────────────┐
                     │  EmailMCP DO    │
                     │  (/mcp)         │
                     │  MCP tools      │
                     └─────────────────┘
```

### Request Flow

1. **Inbound Email** → Cloudflare Email Routing → Worker `email()` handler → `receiveEmail()` → parse with PostalMime → store in MailboxDO + attachments in R2 → trigger `EmailAgent` auto-draft.
2. **API Request** → Hono middleware (Access JWT validation) → route handler → MailboxDO stub → SQLite query → JSON response.
3. **Agent Chat** → WebSocket to `/agents/*` → `routeAgentRequest()` → `EmailAgent` DO → `streamText()` with Workers AI → streaming UI messages.
4. **MCP Request** → HTTP POST to `/mcp` → `EmailMCP` DO → tool execution → MCP-compliant JSON response.
5. **Page Load** → Hono catch-all `*` → React Router request handler → SSR/SPA fallback.

## Data Model

### SQLite Schema (MailboxDO)

**folders**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | slug: inbox, sent, draft, archive, trash, spam |
| name | TEXT UNIQUE | display name |
| is_deletable | INTEGER | 0 for system folders |

**emails**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| folder_id | TEXT FK | references folders.id |
| subject | TEXT | nullable |
| sender | TEXT | lowercase email |
| recipient | TEXT | comma-separated |
| cc | TEXT | nullable |
| bcc | TEXT | nullable |
| date | TEXT | ISO 8601 |
| read | INTEGER | 0/1 |
| starred | INTEGER | 0/1 |
| body | TEXT | HTML content |
| in_reply_to | TEXT | email ID being replied to |
| email_references | TEXT | JSON array of message IDs |
| thread_id | TEXT | conversation grouping key |
| message_id | TEXT | original RFC 2822 Message-ID |
| raw_headers | TEXT | JSON array of {key, value} |

**attachments**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| email_id | TEXT FK | references emails.id |
| filename | TEXT | sanitized |
| mimetype | TEXT | e.g. image/png |
| size | INTEGER | bytes |
| content_id | TEXT | for inline images |
| disposition | TEXT | attachment / inline |

### R2 Storage Layout

```
mailboxes/{email}.json          # mailbox settings (name, forwarding, signature, agentSystemPrompt)
attachments/{emailId}/{attId}/{filename}  # binary blob
```

### Threading Strategy

Emails are grouped into threads using a cascading strategy:
1. **Primary**: `thread_id` derived from `In-Reply-To` / `References` headers.
2. **Fallback**: normalized subject match (strips `Re:`, `Fwd:`, `FW:`, `AW:`, `WG:`, `Réf:`, `SV:`) within 7 days and same participants.
3. **Draft folder**: groups by `in_reply_to` instead of `thread_id` to keep reply-drafts separated.

The MailboxDO uses complex raw SQL CTEs for threaded list queries that compute:
- `thread_count` — number of messages in the conversation
- `thread_unread_count` — unread messages in the conversation
- `participants` — distinct senders
- `needs_reply` — true if last message is not sent/draft and thread has been read before
- `has_draft` — true if any message in the conversation is in the Drafts folder

## Component Design

### MailboxDO (Durable Object)

Responsibilities:
- SQLite schema + migrations
- Email CRUD (Drizzle ORM for simple queries)
- Threaded email listing (raw SQL CTEs)
- Full-text search (raw SQL with dynamic condition builder)
- Folder management
- Rate limiting (20/hour, 100/day sent emails)
- Attachment metadata storage

Notable design decisions:
- Uses both Drizzle and raw SQL — Drizzle for type-safe CRUD, raw SQL for complex analytical queries that Drizzle's query builder cannot express efficiently.
- Migration runner uses `d1_migrations` table for compatibility and wraps migrations in `storage.transactionSync()` for atomicity.

### EmailAgent (AIChatAgent)

Responsibilities:
- Streaming chat via WebSocket
- Auto-draft generation on inbound email
- Tool orchestration (9 email tools)
- Prompt injection defense

Design decisions:
- Custom system prompt per mailbox via R2 settings (`agentSystemPrompt`).
- Auto-draft uses a fresh message context (no chat history) to avoid confusing the model.
- If the model doesn't call `draft_reply`/`draft_email`, the inline text is verified and saved as a draft automatically.
- Prompt injection detection runs on both the inbound email body and the full thread context before any drafting.

### EmailMCP (McpAgent)

Responsibilities:
- Expose email operations as MCP tools at `/mcp`
- Allow external AI clients (Claude Code, Cursor, ProtoAgent) to read/search/draft/send

Design decisions:
- Reuses the same `workers/lib/tools.ts` business logic as the agent.
- Verifies mailbox existence before every operation.
- Uses HTML bodies (not plain text) since MCP clients typically work with HTML.
- Error responses are MCP-compliant with `isError` flag.

### Hono Worker (app.ts)

Responsibilities:
- Cloudflare Access JWT validation middleware
- Route mounting (API → agent WebSocket → React Router catch-all)
- MCP endpoint handling
- Inbound email processing

Middleware order (critical):
1. Access JWT validation (all routes, production only)
2. MCP `/mcp` routes (must be before catch-all)
3. API routes (`/` — mounted from `workers/index.ts`)
4. Agent WebSocket `/agents/*`
5. React Router SPA catch-all `*`

## Security Model

### Trust Boundary

Cloudflare Access is the **single** trust boundary. Any user who passes the Access policy can access all mailboxes. There is no per-mailbox authorization.

### Defensive Measures

| Threat | Mitigation |
|--------|------------|
| Unauthorized access | Cloudflare Access JWT validation; fail-closed in production |
| Email spoofing | `validateSender()` enforces `from` == mailbox ID |
| Abuse / spam | Rate limiting (20/hr, 100/day) per mailbox |
| Prompt injection | `isPromptInjection()` scans email body + thread context before auto-draft |
| Agent hallucination in drafts | `verifyDraft()` strips meta-commentary before saving/sending |
| XSS in email content | `escapeHtml()` + `stripHtmlToText()` before injecting into composer/outgoing emails |
| Large email DoS | 25MB max email size; stream size validation |

## Frontend Architecture

### State Management

- **Server state**: TanStack Query with 30s stale time, 2 retries (except 4xx).
- **Global UI state**: Zustand (`useUIStore`) for sidebar, agent panel, compose modal.
- **Local form state**: React hooks (`useComposeForm`).

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `MailboxSplitView` | Layout: email list (left) + detail panel (right) |
| `EmailPanel` | Read view: header, body iframe, attachments, actions |
| `ComposeEmail` | Modal with TipTap editor for new emails / replies / forwards |
| `AgentPanel` | Chat UI: streaming messages, tool call badges, suggested prompts |
| `Sidebar` | Folder list with unread counts, custom folders |
| `Header` | Search bar, agent toggle, compose button |

### Design System

- Uses `@cloudflare/kumo` component library.
- Tailwind CSS v4 with Kumo design tokens (`kumo-base`, `kumo-line`, `kumo-brand`, etc.).
- All icons from `@phosphor-icons/react`.

## AI Integration

### Model
- **Workers AI**: `@cf/moonshotai/kimi-k2.5`
- **Provider**: `workers-ai-provider` (AI SDK v6 compatible)

### Tools (9 total)

1. `list_emails` — paginated folder listing
2. `get_email` — full email with body + attachments
3. `get_thread` — all messages in a conversation
4. `search_emails` — query across subject/body
5. `draft_email` — create new draft
6. `draft_reply` — reply draft with quoted original
7. `mark_email_read` — toggle read status
8. `move_email` — change folder
9. `discard_draft` — delete a draft

### Agent Behaviors

- **Chat**: streaming markdown responses with visible tool call badges.
- **Auto-draft**: triggered on every inbound email; reads thread; drafts reply; requires human review before sending.
- **Custom prompts**: per-mailbox via Settings UI.
- **Tool limit**: max 5 steps per interaction (`stopWhen: stepCountIs(5)`).

## Deployment Model

### Cloudflare Resources

| Resource | Purpose |
|----------|---------|
| Worker | Hono app + React Router SSR |
| Durable Objects (3 classes) | MailboxDO, EmailAgent, EmailMCP |
| R2 Bucket | Mailbox settings + attachment blobs |
| Workers AI | Agent inference + safety checks |
| Email Routing | Inbound email reception |
| Email Service | Outbound email sending |
| Cloudflare Access | Authentication / authorization |

### Configuration

Required secrets/vars:
- `DOMAINS` — comma-separated domains with Email Routing enabled
- `POLICY_AUD` — Cloudflare Access policy audience
- `TEAM_DOMAIN` — Cloudflare Access team domain or certs URL
- `EMAIL_ADDRESSES` (optional) — restrict mailbox creation to these addresses

### Migrations

Durable Object SQLite migrations are applied automatically on DO wake. The migration runner:
1. Creates `d1_migrations` tracking table if not exists.
2. Checks each migration by name.
3. Runs unapplied migrations inside `storage.transactionSync()`.
4. Strips SQL-level `BEGIN TRANSACTION` / `COMMIT` (forbidden by DO runtime).

## Future Considerations

- **Multi-account support**: Currently all mailboxes share the same Access policy. Per-mailbox auth would require a separate auth layer.
- **Email import**: No IMAP/POP import. All email must arrive via Cloudflare Email Routing.
- **Full-text search**: Current search uses SQLite `LIKE` on subject/body. Could be enhanced with FTS5.
- **Mobile app**: Web-only. PWA support could be added.
- **Offline support**: No service worker or local caching beyond browser defaults.
