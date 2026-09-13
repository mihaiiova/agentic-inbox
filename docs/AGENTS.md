# Agent Notes

Agentic Inbox is a mail client and mail-only MCP server on Cloudflare Workers.

## Current scope

- Mailbox management and settings
- Inbound mail through Email Routing
- Outbound mail through Email Service
- Drafts, replies, forwards, threading, search, folders, labels, and attachments
- MCP at `/mcp` for mail operations

There is no in-app AI chat, automation/rules engine, or Drive/file-browser feature. Optional Pushover notifications are sent for incoming mail. R2 remains an implementation dependency for mailbox metadata and email attachment blobs; it is not exposed as a general-purpose storage feature.

## Structure

- `app/` — React Router UI
- `app/queries/` — TanStack Query hooks
- `app/services/api.ts` — browser API client
- `workers/index.ts` — HTTP API and inbound email handler
- `workers/durableObject/` — per-mailbox SQLite-backed Durable Object
- `workers/mcp/` — mail-only MCP server
- `workers/lib/tools.ts` — shared mail operations used by MCP
- `workers/routes/reply-forward.ts` — reply and forward delivery
- `shared/folders.ts` — canonical folder IDs

## Commands

```bash
npm run dev
npm test
npm run typecheck
npm run build
```

## Configuration

Use `wrangler.jsonc.example` as the template. Required bindings are `MAILBOX`, `EMAIL_MCP`, `EMAIL`, and `BUCKET`. Configure `DOMAINS` and optionally `EMAIL_ADDRESSES`. Production deployments require Cloudflare Access secrets `POLICY_AUD` and `TEAM_DOMAIN`.

Keep the MCP tool set limited to email operations. When changing persisted data, add a Durable Object migration in `workers/durableObject/migrations.ts`.
