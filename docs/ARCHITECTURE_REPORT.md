# Agentic Inbox — System Architecture Report

> Comprehensive architectural overview, feature inventory, and functional analysis of the Agentic Inbox platform.
> Generated: 2026-05-04

---

## 1. Executive Summary

**Agentic Inbox** is a self-hosted, serverless email client with an integrated AI agent, running entirely on Cloudflare's edge infrastructure. It enables users to send, receive, and manage emails through a modern web interface, with each mailbox isolated in its own Durable Object (SQLite) and attachments stored in R2 object storage. The system features a built-in AI agent capable of reading inboxes, searching conversations, drafting replies, and executing email-related tools via chat or the Model Context Protocol (MCP).

**Key Design Philosophy:**
- **Zero infrastructure** — no servers to manage; runs entirely on Cloudflare (Workers, Durable Objects, R2, Workers AI, Email Routing).
- **Per-mailbox isolation** — each mailbox is a separate Durable Object with its own SQLite database.
- **AI-native** — built-in agent that can read, search, draft, and organize emails.
- **Secure by default** — Cloudflare Access is the single trust boundary; fail-closed authentication.
- **Extensible** — MCP server allows external AI tools (Claude Code, Cursor, etc.) to operate on mailboxes.

---

## 2. High-Level Architecture

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌──────────────┐     ┌──────────────────┐     ┌─────────────────────────┐  │
│  │   Browser    │────>│  React SPA       │────>│  Agent Panel (WebSocket)│  │
│  │              │     │  (React Router v7)     │  (AI Chat Stream)       │  │
│  └──────────────┘     └──────────────────┘     └─────────────────────────┘  │
│         │                                                            │      │
│         │                    HTTPS / WebSocket                       │      │
│         └────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDGE WORKER LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Hono Worker (workers/app.ts)                                       │    │
│  │  ┌─────────────────┬─────────────────┬──────────────────────────┐   │    │
│  │  │  Auth Middleware│  API Routes     │  React Router Catch-All  │   │    │
│  │  │  (Access JWT)   │  (workers/index)│  (SPA / SSR)             │   │    │
│  │  └─────────────────┴─────────────────┴──────────────────────────┘   │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────┐   │    │
│  │  │  /mcp endpoint  │  │ /agents/* WS    │  │ email() handler    │   │    │
│  │  │  (EmailMCP DO)  │  │ (EmailAgent DO) │  │ (inbound email)    │   │    │
│  │  └─────────────────┘  └─────────────────┘  └────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DURABLE OBJECTS (STATEFUL)                           │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────┐ │
│  │      MailboxDO          │  │      EmailAgent         │  │   EmailMCP   │ │
│  │  ┌─────────────────┐    │  │  ┌─────────────────┐    │  │  ┌────────┐  │ │
│  │  │  SQLite DB      │    │  │  │  AIChatAgent    │    │  │  │McpAgent│  │ │
│  │  │  (per mailbox)  │    │  │  │  ├─ streamText  │    │  │  │        │  │ │
│  │  │  ├─ emails      │    │  │  │  ├─ generateText│    │  │  │        │  │ │
│  │  │  ├─ folders     │    │  │  │  ├─ 13 tools    │    │  │  │        │  │ │
│  │  │  ├─ attachments │    │  │  │  ├─ auto-draft  │    │  │  │        │  │ │
│  │  │  ├─ labels      │    │  │  │  └─ chat history│    │  │  │        │  │ │
│  │  │  ├─ rules       │    │  │  └─────────────────┘    │  │  └────────┘  │ │
│  │  │  ├─ rule_logs   │    │  │                         │  │              │ │
│  │  │  └─ drive_files │    │  │  Model: @cf/moonshotai/ │  │              │ │
│  │  └─────────────────┘    │  │         kimi-k2.5       │  │              │ │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STORAGE & AI LAYER                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────┐ │
│  │  R2 Bucket              │  │  Workers AI             │  │  Email Svcs  │ │
│  │  ├─ mailboxes/{id}.json │  │  ├─ Agent inference     │  │  ├─ Routing  │ │
│  │  ├─ attachments/...     │  │  ├─ verifyDraft         │  │  ├─ Sending  │ │
│  │  └─ drive/...           │  │  └─ isPromptInjection   │  │  └─ Receive  │ │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Request Flows

#### Inbound Email Flow
1. **Sender** sends email to `user@example.com`
2. **Cloudflare Email Routing** receives and forwards to the Worker
3. **Worker `email()` handler** (`workers/app.ts`) invokes `receiveEmail()`
4. **PostalMime** parses the raw email (headers, body, attachments)
5. **MailboxDO** stores email in SQLite; attachments go to **R2**
6. **Rule Engine** (`applyRules`) evaluates static and agent-based automation rules
7. **EmailAgent** (optional) auto-drafts a reply via `handleNewEmail()`

#### API Request Flow
1. **Browser** makes API call (e.g., list emails)
2. **Hono middleware** validates Cloudflare Access JWT (production only)
3. **Route handler** (`workers/index.ts`) processes request
4. **MailboxDO stub** is fetched via `idFromName(mailboxId)`
5. **SQLite query** executes (Drizzle ORM or raw SQL)
6. **JSON response** returns to client

#### Agent Chat Flow
1. **Browser** opens WebSocket to `/agents/:mailboxId`
2. **`routeAgentRequest`** routes to `EmailAgent` Durable Object
3. **`onChatMessage`** streams text via `streamText()` with Workers AI
4. **Tool calls** (up to 5 steps) execute against MailboxDO
5. **Streaming markdown** responses render in the Agent Panel UI

#### MCP Request Flow
1. **External AI client** (Claude Code, Cursor, etc.) POSTs to `/mcp`
2. **`EmailMCP.serve()`** handles the request via `EmailMCP` Durable Object
3. **MCP tools** execute email operations using shared `workers/lib/tools.ts`
4. **MCP-compliant JSON** response returns to the client

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 | UI framework |
| | React Router v7 (framework mode) | Routing + SSR |
| | Tailwind CSS v4 | Utility-first styling |
| | `@cloudflare/kumo` | Design system / component library |
| | Zustand | Global UI state management |
| | TanStack Query | Server state / data fetching |
| | TipTap (`@tiptap/react`) | Rich text email composer |
| | `@phosphor-icons/react` | Icon library |
| | `react-markdown` + `remark-gfm` | Agent message rendering |
| **Backend** | Hono | Lightweight web framework |
| | Cloudflare Workers | Serverless compute |
| | Durable Objects (SQLite) | Stateful per-mailbox storage |
| | R2 | Object storage (attachments, settings) |
| | Email Routing / Email Service | Inbound / outbound email |
| | Cloudflare Access | Authentication / authorization |
| **AI** | Cloudflare Agents SDK | `AIChatAgent`, `McpAgent` |
| | AI SDK v6 | `streamText`, `generateText`, tool orchestration |
| | Workers AI | `@cf/moonshotai/kimi-k2.5` model |
| | `workers-ai-provider` | AI SDK v6 compatible provider |
| **ORM / DB** | Drizzle ORM (`drizzle-orm/durable-sqlite`) | Type-safe SQLite CRUD |
| | Raw SQL (`storage.sql.exec`) | Complex analytical queries |
| **Auth** | `jose` (JWT verification) | Cloudflare Access JWT validation |

---

## 4. Backend Architecture

### 4.1 Worker Entry Point (`workers/app.ts`)

The main Hono application that orchestrates all request handling:

| Responsibility | Implementation |
|---------------|----------------|
| Auth middleware | Cloudflare Access JWT validation (fail-closed in production) |
| MCP endpoint | `/mcp` and `/mcp/*` — mounts `EmailMCP.serve()` |
| API routes | Mounted from `workers/index.ts` at `/` |
| Agent WebSocket | `/agents/*` — routes to `EmailAgent` DO |
| SPA catch-all | `*` — React Router request handler for SSR/SPA fallback |
| Email handler | `email()` — processes inbound emails from Cloudflare Email Routing |

**Middleware Order (critical):**
1. Access JWT validation (`*`)
2. MCP routes (`/mcp`, `/mcp/*`)
3. API routes (`/`)
4. Agent WebSocket (`/agents/*`)
5. React Router catch-all (`*`)

### 4.2 API Routes (`workers/index.ts`)

RESTful API organized by resource:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/config` | GET | Returns allowed domains and restricted email addresses |
| `/api/v1/mailboxes` | GET, POST | List or create mailboxes |
| `/api/v1/mailboxes/:id` | GET, PUT, DELETE | Manage a specific mailbox |
| `/api/v1/mailboxes/:id/emails` | GET, POST | List or send emails |
| `/api/v1/mailboxes/:id/emails/:id` | GET, PUT, DELETE | Manage a specific email |
| `/api/v1/mailboxes/:id/drafts` | POST | Create a draft email |
| `/api/v1/mailboxes/:id/emails/:id/move` | POST | Move email to another folder |
| `/api/v1/mailboxes/:id/emails/:id/reply` | POST | Reply to an email |
| `/api/v1/mailboxes/:id/emails/:id/forward` | POST | Forward an email |
| `/api/v1/mailboxes/:id/threads/:id` | GET | Get all emails in a thread |
| `/api/v1/mailboxes/:id/threads/:id/read` | POST | Mark entire thread as read |
| `/api/v1/mailboxes/:id/folders` | GET, POST | List or create folders |
| `/api/v1/mailboxes/:id/folders/:id` | PUT, DELETE | Manage a specific folder |
| `/api/v1/mailboxes/:id/search` | GET | Search emails with filters |
| `/api/v1/mailboxes/:id/labels` | GET, POST | List or create labels |
| `/api/v1/mailboxes/:id/labels/:id` | DELETE | Delete a label |
| `/api/v1/mailboxes/:id/emails/:id/labels` | POST, DELETE | Add/remove email labels |
| `/api/v1/mailboxes/:id/rules` | GET, POST | List or create automation rules |
| `/api/v1/mailboxes/:id/rules/:id` | PUT, DELETE | Manage a specific rule |
| `/api/v1/mailboxes/:id/rule-logs` | GET | View rule execution logs |
| `/api/v1/mailboxes/:id/drive` | GET | List Drive files |
| `/api/v1/mailboxes/:id/drive/:id/download` | GET | Download a Drive file |
| `/api/v1/mailboxes/:id/drive/:id` | DELETE | Delete a Drive file |
| `/api/v1/mailboxes/:id/emails/:eid/attachments/:aid` | GET | Download an attachment |

### 4.3 MailboxDO (`workers/durableObject/index.ts`)

The core stateful component — one instance per mailbox, identified by email address.

**Responsibilities:**
- SQLite schema management + automatic migrations
- Email CRUD (Drizzle ORM for simple queries)
- Threaded email listing (complex raw SQL CTEs)
- Full-text search (raw SQL with dynamic condition builder)
- Folder management with unread counts
- Rate limiting (20/hour, 100/day sent emails)
- Attachment metadata storage
- Label management
- Automation rule engine (static + agent-based)
- Drive file catalog

**Threading Strategy:**
1. **Primary**: `thread_id` derived from `In-Reply-To` / `References` headers
2. **Fallback**: Normalized subject match (strips `Re:`, `Fwd:`, `FW:`, `AW:`, `WG:`, `Réf:`, `SV:`) within 7 days and same participants
3. **Draft folder**: Groups by `in_reply_to` to keep reply-drafts separated

**Threaded List CTEs compute:**
- `thread_count` — number of messages in conversation
- `thread_unread_count` — unread messages in conversation
- `participants` — distinct senders
- `needs_reply` — true if last message is not sent/draft and thread has been read before
- `has_draft` — true if any message in conversation is in Drafts folder

### 4.4 EmailAgent (`workers/agent/index.ts`)

Extends `AIChatAgent` from the Cloudflare Agents SDK.

**Responsibilities:**
- Streaming chat via WebSocket
- Auto-draft generation on inbound email (currently disabled in production but fully implemented)
- Tool orchestration (13 email tools)
- Prompt injection defense
- Custom system prompt per mailbox via R2 settings

**Agent Tools (13 total):**

| Tool | Purpose |
|------|---------|
| `list_emails` | Paginated folder listing |
| `get_email` | Full email with body + attachments |
| `get_thread` | All messages in a conversation |
| `search_emails` | Query across subject/body |
| `draft_email` | Create new draft |
| `draft_reply` | Reply draft with quoted original |
| `mark_email_read` | Toggle read status |
| `move_email` | Change folder |
| `discard_draft` | Delete a draft |
| `create_static_rule` | Create condition-based automation rule |
| `create_agent_rule` | Create AI-evaluated automation rule |
| `list_rules` | List all automation rules |
| `delete_rule` | Delete a rule by ID |
| `classify_email` | Ad-hoc email classification |

**Auto-Draft Behavior:**
1. Triggered on inbound email (currently commented out in `receiveEmail`)
2. Pre-reads email + thread context
3. Runs prompt injection detection on both email body and thread context
4. Calls `generateText()` with fresh context (no chat history)
5. If `draft_reply` tool is called, draft is saved automatically
6. If model returns inline text, `verifyDraft()` sanitizes it and saves as draft
7. Conversation logged to agent chat history

### 4.5 EmailMCP (`workers/mcp/index.ts`)

Extends `McpAgent` — exposes email operations as MCP tools at `/mcp`.

**Purpose:** Allow external AI clients (Claude Code, Cursor, ProtoAgent, etc.) to operate on mailboxes.

**MCP Tools:**
- `list_mailboxes`, `list_emails`, `get_email`, `get_thread`
- `search_emails`, `draft_reply`, `create_draft`, `update_draft`
- `delete_email`, `send_reply`, `send_email`, `mark_email_read`, `move_email`

**Design Decisions:**
- Reuses the same `workers/lib/tools.ts` business logic as the agent
- Verifies mailbox existence before every operation
- Uses HTML bodies (not plain text) since MCP clients typically work with HTML
- Error responses are MCP-compliant with `isError` flag

### 4.6 Shared Libraries (`workers/lib/`)

| Module | Responsibility |
|--------|---------------|
| `tools.ts` | Shared tool business logic (Agent + MCP) |
| `email-helpers.ts` | DO stubs, validation, threading, HTML utilities |
| `schemas.ts` | Zod schemas for API + types |
| `attachments.ts` | R2 attachment storage helpers |
| `ai.ts` | `verifyDraft()`, `isPromptInjection()` helpers |
| `mailbox.ts` | Hono middleware: `requireMailbox` |
| `classification.ts` | Email classification for agent rules |
| `notifications.ts` | Pushover notification integration |

---

## 5. Frontend Architecture

### 5.1 Route Structure (`app/routes.ts`)

```
/                          → Home (mailbox list + create/delete)
/mailbox/:mailboxId        → Mailbox layout (sidebar, header, agent panel)
  /                        → Index (redirects to inbox)
  /emails/:folder          → Folder email list + thread view
  /settings                → Mailbox settings (system prompt, forwarding, signature)
  /search                  → Search results page
  /drive                   → Drive files list
*                          → Not found
```

### 5.2 State Management

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Server state** | TanStack Query | 30s stale time, 2 retries (except 4xx) |
| **Global UI state** | Zustand (`useUIStore`) | Sidebar, agent panel, compose modal |
| **Local form state** | React hooks (`useComposeForm`) | Compose form fields |

### 5.3 Key Components

| Component | Responsibility |
|-----------|---------------|
| `MailboxSplitView` | Layout: email list (left) + detail panel (right) |
| `EmailPanel` | Read view: header, body iframe, attachments, actions |
| `ComposeEmail` | Modal with TipTap editor for new emails / replies / forwards |
| `AgentPanel` | Chat UI: streaming messages, tool call badges, suggested prompts |
| `AgentSidebar` | Agent panel container with toggle |
| `Sidebar` | Folder list with unread counts, custom folders |
| `Header` | Search bar, agent toggle, compose button |
| `MCPPanel` | MCP integration UI |
| `RichTextEditor` | TipTap-based composer |
| `EmailIframe` | Secure email body rendering |
| `EmailAttachmentList` | Attachment display + download |

### 5.4 Design System

- **Component library:** `@cloudflare/kumo`
- **Styling:** Tailwind CSS v4 with Kumo design tokens (`kumo-base`, `kumo-line`, `kumo-brand`, etc.)
- **Icons:** `@phosphor-icons/react`
- **Rich text editor:** TipTap with extensions (color, highlight, link, text-align, underline, etc.)

---

## 6. Data Model

### 6.1 SQLite Schema (MailboxDO)

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

**labels**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | slug |
| name | TEXT UNIQUE | display name |
| color | TEXT | theme color |

**email_labels** (junction)
| Column | Type | Notes |
|--------|------|-------|
| email_id | TEXT FK | |
| label_id | TEXT FK | |

**rules**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT | rule name |
| type | TEXT | "static" or "agent" |
| enabled | INTEGER | 0/1 |
| match_all | INTEGER | 0=OR, 1=AND |
| conditions | TEXT | JSON array |
| agent_prompt | TEXT | for agent rules |
| action_type | TEXT | e.g. add_label |
| action_params | TEXT | JSON object |

**rule_logs**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| email_id | TEXT FK | |
| rule_id | TEXT FK | |
| rule_type | TEXT | |
| action_type | TEXT | |
| status | TEXT | matched/not_matched/failed |
| details | TEXT | JSON |
| created_at | TEXT | ISO 8601 |

**drive_files**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| email_id | TEXT FK | source email |
| filename | TEXT | |
| mimetype | TEXT | |
| size | INTEGER | bytes |
| r2_key | TEXT | R2 object key |
| created_at | TEXT | ISO 8601 |

### 6.2 R2 Storage Layout

```
mailboxes/{email}.json          # mailbox settings (name, forwarding, signature, agentSystemPrompt)
attachments/{emailId}/{attId}/{filename}  # binary blob
 drive/{driveFileId}/{filename}           # copied attachment blob
```

---

## 7. Security Model

### 7.1 Trust Boundary

**Cloudflare Access** is the single trust boundary. Any user who passes the Access policy can access all mailboxes. There is no per-mailbox authorization.

### 7.2 Defensive Measures

| Threat | Mitigation |
|--------|------------|
| Unauthorized access | Cloudflare Access JWT validation; fail-closed in production |
| Email spoofing | `validateSender()` enforces `from` == mailbox ID |
| Abuse / spam | Rate limiting (20/hr, 100/day) per mailbox |
| Prompt injection | `isPromptInjection()` scans email body + thread context before auto-draft |
| Agent hallucination in drafts | `verifyDraft()` strips meta-commentary before saving/sending |
| XSS in email content | `escapeHtml()` + `stripHtmlToText()` before injecting into composer/outgoing emails |
| Large email DoS | 25MB max email size; stream size validation |

### 7.3 Required Secrets / Environment Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `DOMAINS` | string | Comma-separated domains with Email Routing enabled |
| `POLICY_AUD` | secret | Cloudflare Access policy audience |
| `TEAM_DOMAIN` | secret | Cloudflare Access team domain or certs URL |
| `EMAIL_ADDRESSES` | string[] | Optional: restrict mailbox creation to these addresses |

---

## 8. Feature Inventory

### 8.1 Core Email Client

| Feature | Status | Description |
|---------|--------|-------------|
| **Send emails** | ✅ | Rich text composer with TipTap; supports to/cc/bcc |
| **Receive emails** | ✅ | Via Cloudflare Email Routing; parsed with PostalMime |
| **Reply** | ✅ | Pre-populated reply with quoted original, threading headers |
| **Forward** | ✅ | Forward with original body quoted |
| **Drafts** | ✅ | Save drafts, update, discard; auto-marked in threads |
| **Folders** | ✅ | inbox, sent, draft, archive, trash, spam + custom folders |
| **Threading** | ✅ | Header-based + subject fallback; threaded list view |
| **Search** | ✅ | Query across subject/body/sender/recipient + advanced filters |
| **Attachments** | ✅ | Upload/download; stored in R2; inline + attachment disposition |
| **Star/Read** | ✅ | Toggle read and starred status |
| **Mark thread read** | ✅ | Bulk mark all messages in thread as read |

### 8.2 AI Agent Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Chat interface** | ✅ | WebSocket streaming with markdown rendering |
| **Tool calling** | ✅ | 13 tools for email operations |
| **Auto-draft** | ⚠️ Implemented but disabled | Auto-generates draft reply on inbound email |
| **Custom system prompt** | ✅ | Per-mailbox configurable via Settings UI |
| **Tool visibility** | ✅ | Tool call badges shown in chat UI |
| **Prompt injection defense** | ✅ | Scans email + thread before auto-draft |
| **Draft verification** | ✅ | AI strips meta-commentary from drafts |
| **Chat history** | ✅ | Persistent per-mailbox via agent DO |

### 8.3 Automation Rules

| Feature | Status | Description |
|---------|--------|-------------|
| **Static rules** | ✅ | Condition-based: contains/equals/starts_with/ends_with/matches/classification |
| **Agent rules** | ✅ | AI-evaluated natural language matching |
| **Rule actions** | ✅ | add_label, save_attachment, send_notification (Pushover) |
| **Rule logging** | ✅ | Execution history with status and details |
| **AND/OR logic** | ✅ | match_all toggle for condition evaluation |
| **Batch classification** | ✅ | Agent rules evaluated in a single AI call |

### 8.4 Drive / File Management

| Feature | Status | Description |
|---------|--------|-------------|
| **Drive file list** | ✅ | Catalog of saved attachments |
| **Save attachment** | ✅ | Rule action copies attachments to Drive |
| **Download** | ✅ | Direct download with proper headers |
| **Delete** | ✅ | Remove from Drive + R2 |

### 8.5 MCP Server

| Feature | Status | Description |
|---------|--------|-------------|
| **MCP endpoint** | ✅ | `/mcp` serves MCP protocol |
| **External AI clients** | ✅ | Compatible with Claude Code, Cursor, etc. |
| **Tool parity** | ✅ | Same business logic as web agent |

---

## 9. Deployment Model

### 9.1 Cloudflare Resources

| Resource | Purpose |
|----------|---------|
| **Worker** | Hono app + React Router SSR |
| **Durable Objects (3 classes)** | MailboxDO, EmailAgent, EmailMCP |
| **R2 Bucket** | Mailbox settings + attachment blobs |
| **Workers AI** | Agent inference + safety checks |
| **Email Routing** | Inbound email reception |
| **Email Service** | Outbound email sending |
| **Cloudflare Access** | Authentication / authorization |

### 9.2 Build & Deploy

```bash
npm install
npm run dev       # Vite dev server with local DO simulation
npm run typecheck # cf-typegen + react-router typegen + tsc
npm run build     # react-router build
npm run deploy    # Build + wrangler deploy
```

- **Config source of truth:** `wrangler.jsonc`
- **Compatibility date:** `2025-11-28`
- **Compatibility flag:** `nodejs_compat`
- **Vite plugin:** `@cloudflare/vite-plugin` with `viteEnvironment: { name: "ssr" }`
- **R2 bucket:** must exist before running (`wrangler r2 bucket create agentic-inbox`)

---

## 10. Performance & Scalability

| Aspect | Strategy |
|--------|----------|
| **Per-mailbox isolation** | Each mailbox is an independent Durable Object — natural horizontal partitioning |
| **SQLite queries** | Capped pagination (max 100 per page); indexed lookups on id, folder_id, thread_id |
| **Threaded CTEs** | Complex but single-query conversation aggregation |
| **Rate limiting** | 20/hour, 100/day per mailbox — prevents abuse |
| **Email size limit** | 25MB max inbound email |
| **Attachment streaming** | R2 supports streaming download; no memory pressure for large files |
| **Agent tool limit** | Max 5 steps per interaction (`stopWhen: stepCountIs(5)`) |
| **Batch classification** | Agent rules evaluated in a single AI inference call |

---

## 11. Future Considerations

| Feature | Status | Notes |
|---------|--------|-------|
| **Multi-account support** | Not implemented | All mailboxes share the same Access policy |
| **Email import** | Not implemented | No IMAP/POP import; all email must arrive via Cloudflare Email Routing |
| **Full-text search** | SQLite LIKE only | Could be enhanced with FTS5 |
| **Mobile app** | Web-only | PWA support could be added |
| **Offline support** | None | No service worker or local caching beyond browser defaults |
| **Auto-draft** | Implemented but disabled | Can be re-enabled by uncommenting code in `receiveEmail()` |
| **Thread context in classification** | Under evaluation | See TODO.md for design decisions |

---

## 12. File Structure Reference

```
agentic-inbox/
├── workers/
│   ├── app.ts                 # Main Hono app — exports fetch + email handler
│   ├── index.ts               # API routes (mailboxes, emails, folders, search, drafts)
│   ├── types.ts               # Env interface (extends Cloudflare.Env)
│   ├── email-sender.ts        # Wrapper around the `send_email` Worker binding
│   ├── agent/
│   │   └── index.ts           # EmailAgent (AIChatAgent)
│   ├── durableObject/
│   │   ├── index.ts           # MailboxDO — SQLite CRUD, threading, search, rate limits
│   │   └── migrations.ts      # Custom migration runner
│   ├── db/
│   │   └── schema.ts          # Drizzle schema
│   ├── lib/
│   │   ├── tools.ts           # Shared tool business logic (Agent + MCP)
│   │   ├── email-helpers.ts   # DO stubs, validation, threading, HTML utilities
│   │   ├── schemas.ts         # Zod schemas for API + types
│   │   ├── attachments.ts     # R2 attachment storage helpers
│   │   ├── ai.ts              # verifyDraft, isPromptInjection helpers
│   │   ├── mailbox.ts         # Hono middleware: requireMailbox
│   │   ├── classification.ts  # Email classification engine
│   │   └── notifications.ts   # Pushover integration
│   ├── routes/
│   │   └── reply-forward.ts   # Reply / forward route handlers
│   └── mcp/
│       └── index.ts           # EmailMCP (McpAgent)
├── app/
│   ├── root.tsx               # React Router root
│   ├── routes.ts              # Route config
│   ├── routes/
│   │   ├── home.tsx
│   │   ├── mailbox.tsx
│   │   ├── email-list.tsx
│   │   ├── mailbox-index.tsx
│   │   ├── settings.tsx
│   │   ├── search-results.tsx
│   │   ├── drive.tsx
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── AgentPanel.tsx
│   │   ├── AgentSidebar.tsx
│   │   ├── ComposeEmail.tsx
│   │   ├── ComposePanel.tsx
│   │   ├── EmailPanel.tsx
│   │   ├── MailboxSplitView.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── MCPPanel.tsx
│   │   ├── RichTextEditor.tsx
│   │   ├── EmailAttachmentList.tsx
│   │   ├── EmailIframe.tsx
│   │   └── email-panel/       # Sub-components
│   ├── services/
│   │   └── api.ts             # Typed fetch wrapper + API client
│   ├── queries/               # TanStack Query hooks
│   ├── hooks/                 # Zustand stores, compose form
│   └── lib/                   # search-parser, utils
├── shared/
│   ├── folders.ts             # Canonical folder IDs + display names
│   └── dates.ts               # Date formatting utilities
├── docs/
│   ├── AGENTS.md              # Agent guide (coding conventions)
│   ├── DESIGN.md              # Design document
│   ├── SPEC-DRIVE.md          # Drive specification
│   └── PRDs/                  # Product requirement documents
├── public/
│   └── favicon.svg, favicon.ico
├── wrangler.jsonc             # Cloudflare bindings config
├── vite.config.ts             # Vite configuration
├── react-router.config.ts     # React Router framework config
└── package.json
```

---

*Report generated from source code analysis of the Agentic Inbox repository.*
