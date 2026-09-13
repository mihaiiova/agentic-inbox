# Architecture Report

## Summary

Agentic Inbox is a focused, self-hosted email client with a mail-only MCP
server. It runs on Cloudflare Workers and uses one Durable Object per mailbox.

## Components

- **Worker (`workers/app.ts`)** — Cloudflare Access middleware, HTTP API,
  React Router SSR, MCP endpoint, and inbound email entrypoint.
- **Mailbox API (`workers/index.ts`)** — mailbox CRUD, email operations,
  drafts, threads, search, folders, labels, and attachment downloads.
- **MailboxDO (`workers/durableObject/index.ts`)** — SQLite-backed mailbox
  persistence and email/thread operations.
- **EmailMCP (`workers/mcp/index.ts`)** — MCP tools for mailboxes, messages,
  threads, drafts, sending, search, and message state.
- **Browser app (`app/`)** — mailbox landing page, inbox, search, compose,
  message detail, and settings/MCP connection details.
- **R2** — implementation storage for mailbox settings and email attachment
  blobs only. There is no Drive or general storage feature. Optional Pushover
  delivery notifies users when inbound mail is persisted.

## Data flow

Inbound mail is parsed by PostalMime and written to the selected MailboxDO.
Outbound mail is sent through Cloudflare Email Service and recorded in the
Sent folder. The browser and MCP server call the same mailbox operations, so
mail state is consistent across both interfaces.

## Scope boundary

The project intentionally does not include an in-app AI agent/chat, rules or
automation engine, classification, or Drive/file management. Optional Pushover
notifications are limited to incoming mail. Obsolete automation and Drive tables are removed by the latest
Durable Object migration.

## Verification

```bash
npm test
npm run typecheck
npm run build
```
