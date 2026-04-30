# Agentic Inbox — Agent Guide

> This document is for AI coding agents working on this codebase. It contains build steps, conventions, project structure, and context that isn't in the human-facing README.

## Project Overview

Agentic Inbox is a self-hosted email client with an AI agent, running entirely on Cloudflare Workers. It receives emails via Cloudflare Email Routing, stores them in per-mailbox Durable Objects (SQLite), and serves a React SPA with an AI-powered side panel.

- **License**: Apache 2.0
- **Type**: ESM TypeScript (Node.js module resolution)
- **Entry**: `workers/app.ts`

## Quick Start

```bash
npm install
npm run dev       # Vite dev server with local DO simulation
npm run deploy    # Build + wrangler deploy
npm run typecheck # cf-typegen + react-router typegen + tsc
```

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, React Router v7 (framework mode), Tailwind CSS v4, Zustand, TipTap, `@cloudflare/kumo` |
| Backend | Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing / Email Service |
| AI | Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` |
| Auth | Cloudflare Access JWT validation (required in production) |
| ORM | Drizzle ORM (`drizzle-orm/durable-sqlite`) |

## Project Structure

```
workers/
  app.ts                 # Main Hono app — exports fetch + email handler
  index.ts               # API routes (mailboxes, emails, folders, search, drafts)
  types.ts               # Env interface (extends Cloudflare.Env)
  email-sender.ts        # Wrapper around the `send_email` Worker binding
  agent/
    index.ts             # EmailAgent (AIChatAgent) — chat + auto-draft on new email
  durableObject/
    index.ts             # MailboxDO — SQLite CRUD, threading, search, rate limits
    migrations.ts        # Custom migration runner (d1_migrations table)
  db/
    schema.ts            # Drizzle schema: folders, emails, attachments
  lib/
    tools.ts             # Shared tool business logic (Agent + MCP)
    email-helpers.ts     # DO stubs, validation, threading, HTML utilities
    schemas.ts           # Zod schemas for API + types
    attachments.ts       # R2 attachment storage helpers
    ai.ts                # verifyDraft, isPromptInjection helpers
    mailbox.ts           # Hono middleware: requireMailbox
  routes/
    reply-forward.ts     # Reply / forward route handlers
  mcp/
    index.ts             # EmailMCP (McpAgent) — MCP server at /mcp
app/
  root.tsx               # React Router root (QueryClient, Kumo LinkProvider)
  routes.ts              # Route config (home, mailbox/*, search, settings)
  routes/
    home.tsx             # Mailbox list + create/delete
    mailbox.tsx          # Mailbox layout (sidebar, header, agent panel)
    email-list.tsx       # Folder email list + thread view
    mailbox-index.tsx    # Mailbox landing (redirects to inbox)
    settings.tsx         # Mailbox settings (system prompt, forwarding, etc.)
    search-results.tsx   # Search results page
  components/
    AgentPanel.tsx       # Agent chat UI (WebSocket, streaming markdown)
    AgentSidebar.tsx     # Agent panel container
    ComposeEmail.tsx     # Compose modal + rich text editor
    EmailPanel.tsx       # Email read panel
    MailboxSplitView.tsx # Split view layout (list + detail)
    Sidebar.tsx          # Folder sidebar
    Header.tsx           # Top bar with search + agent toggle
    email-panel/         # Sub-components for EmailPanel
  services/api.ts        # Typed fetch wrapper + API client
  queries/               # TanStack Query hooks
  hooks/                 # Zustand stores (useUIStore), compose form
  lib/                   # search-parser, utils
shared/
  folders.ts             # Canonical folder IDs + display names
  dates.ts               # Date formatting utilities
public/
  favicon.svg, favicon.ico
```

## Key Conventions

### Code Style
- All source files start with the Cloudflare Apache 2.0 copyright header.
- Use tabs for indentation (consistent across the repo).
- Strict TypeScript: `strict: true`, `noEmit: true`, `verbatimModuleSyntax: true`.
- Prefer `type` imports to satisfy `verbatimModuleSyntax`.

### API Patterns
- Hono routes live in `workers/index.ts` and are mounted in `workers/app.ts`.
- All mailbox-scoped routes use `requireMailbox` middleware (`/api/v1/mailboxes/:mailboxId/*`).
- CORS is configured for `/api/*` — allows same-origin and localhost in dev, blocks others.
- Query params: use `intQuery()` and `boolQuery()` helpers for safe parsing.
- Errors: API returns `{ error: string }` JSON with appropriate status codes.

### Durable Object Patterns
- `MailboxDO` is instantiated per mailbox via `env.MAILBOX.idFromName(mailboxId)`.
- SQLite migrations run automatically in the constructor via `applyMigrations()`.
- Drizzle ORM is used for simple CRUD; raw SQL via `this.ctx.storage.sql.exec()` is used for complex queries (threading, search, counts).
- Sent emails are automatically marked `read = 1` to prevent inflating unread counts.

### Agent Patterns
- `EmailAgent` extends `AIChatAgent<any>` (typed as `any` to avoid binding shape conflicts).
- Tools are defined as plain objects (not AI SDK `tool()`) to avoid v6 overload issues.
- The agent uses `streamText` for chat and `generateText` for auto-draft on new email.
- `stopWhen: stepCountIs(5)` limits tool call chains.
- Auto-draft on inbound email: reads email + thread, calls `draft_reply`, persists result to chat history.
- Prompt injection detection (`isPromptInjection`) guards auto-draft for both the email body and thread context.

### MCP Patterns
- `EmailMCP` extends `McpAgent<Env>` and serves at `/mcp` via `EmailMCP.serve()`.
- All tools verify the mailbox exists via `env.BUCKET.head()` before operating.
- MCP uses HTML bodies (`isPlainText: false`) while the agent chat uses plain text (`isPlainText: true`).

### Frontend Patterns
- Data fetching: TanStack Query with custom hooks in `app/queries/`.
- Global UI state: Zustand (`useUIStore`) for sidebar, agent panel, compose modal.
- Styling: Tailwind CSS v4 with `@cloudflare/kumo` design tokens (`bg-kumo-base`, `text-kumo-default`, etc.).
- Icons: `@phosphor-icons/react`.
- Rich text editor: TipTap (`@tiptap/react` + extensions).
- Agent chat: dynamically imports `agents/react` and `@cloudflare/ai-chat/react` to avoid SSR issues.

### Security
- **Cloudflare Access**: JWT validation middleware in `workers/app.ts`. Fails closed in production if `POLICY_AUD` or `TEAM_DOMAIN` are missing. Skipped in `import.meta.env.DEV`.
- **Sender validation**: `validateSender()` ensures the `from` address matches the mailbox.
- **Rate limiting**: `checkSendRateLimit()` in MailboxDO — 20/hour, 100/day per mailbox.
- **Draft verification**: `verifyDraft()` uses Workers AI to strip agent commentary from draft bodies.
- **Prompt injection**: `isPromptInjection()` scans inbound emails and thread context before auto-drafting.
- **XSS prevention**: `escapeHtml()` and `stripHtmlToText()` are used before injecting content into emails or the compose editor.

## Environment / Bindings

| Binding | Type | Usage |
|---------|------|-------|
| `MAILBOX` | DurableObjectNamespace | MailboxDO instances |
| `EMAIL_AGENT` | DurableObjectNamespace | EmailAgent instances |
| `EMAIL_MCP` | DurableObjectNamespace | EmailMCP instances |
| `BUCKET` | R2Bucket | Mailbox settings JSON + attachment blobs |
| `EMAIL` | SendEmail | Outbound email sending |
| `AI` | Ai | Workers AI (agent + verification + injection detection) |
| `DOMAINS` | string | Comma-separated allowed domains |
| `EMAIL_ADDRESSES` | string[] | Optional restrict list for mailbox creation |
| `POLICY_AUD` | string | Cloudflare Access policy audience (secret) |
| `TEAM_DOMAIN` | string | Cloudflare Access team domain (secret) |

## Build & Deploy Notes

- `wrangler.jsonc` is the source of truth for bindings. Compatibility date: `2025-11-28`, flag: `nodejs_compat`.
- Vite config uses `@cloudflare/vite-plugin` with `viteEnvironment: { name: "ssr" }`.
- Type generation: `wrangler types` generates `worker-configuration.d.ts`; `react-router typegen` generates route types.
- R2 bucket `agentic-inbox` must exist before running (`wrangler r2 bucket create agentic-inbox`).

## Common Tasks for Agents

### Adding a new API endpoint
1. Add the route in `workers/index.ts` under the appropriate section.
2. If mailbox-scoped, ensure it uses `requireMailbox` middleware (or is under the `:mailboxId` path).
3. Add the corresponding client method in `app/services/api.ts`.
4. Add a TanStack Query hook in `app/queries/` if needed.

### Adding a new agent tool
1. Implement the business logic in `workers/lib/tools.ts`.
2. Register it in `workers/agent/index.ts` inside `createEmailTools()`.
3. Add a `TOOL_LABELS` entry in `app/components/AgentPanel.tsx` for the UI badge.
4. If exposing via MCP, register it in `workers/mcp/index.ts`.

### Adding a database migration
1. Add a `Migration` object to `workers/durableObject/migrations.ts` in the `mailboxMigrations` array.
2. Use `txn()` wrapper for multi-statement migrations (it gets stripped for DO's `transactionSync`).
3. Keep migrations idempotent where possible (`IF NOT EXISTS`).
4. Existing DOs will auto-migrate on next wake.

### Updating the frontend route tree
1. Edit `app/routes.ts`.
2. Create the route component in `app/routes/`.
3. Run `npm run typecheck` to generate route types.

## Testing

There is no formal test suite in the repo. Test manually via:
- `npm run dev` for local development
- `curl` or the browser devtools for API routes
- The agent panel UI for agent behavior

## Troubleshooting

- `Invalid or expired Access token` → `POLICY_AUD` or `TEAM_DOMAIN` secrets are wrong. Turn Access off and back on in the Worker dashboard to refresh values.
- `Cloudflare Access must be configured in production` → Missing secrets in production. Required outside local dev.
- Agent not connecting → Check WebSocket route `/agents/*` and that `EmailAgent` DO binding is configured.
- Emails not arriving → Verify Email Routing catch-all rule points to this Worker, and the mailbox exists in R2.
