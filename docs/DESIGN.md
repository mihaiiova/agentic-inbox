# Design

Agentic Inbox provides a focused email experience with a mail-only MCP interface.

## Runtime

```text
Email Routing ──> Worker email() ──> PostalMime ──> MailboxDO (SQLite)
Browser ────────> Worker HTTP API ──> MailboxDO
MCP client ─────> /mcp ────────────> EmailMCP ──> MailboxDO
Worker ─────────> Email Service (outbound mail)
Worker ─────────> R2 (mailbox metadata and email attachments)
Worker ─────────> Pushover (optional incoming-mail notifications)
```

## Mailbox data

Each mailbox has a Durable Object with folders, messages, threading metadata,
labels, and attachment metadata. Message bodies and attachment metadata are
kept with the mailbox. Attachment blobs are stored in R2 so incoming and
outgoing mail can retain attachments without exposing a general file browser.
Mailbox settings are stored as `mailboxes/{address}.json` in R2.

The migration list contains a cleanup migration for deployments that formerly
had automation and Drive tables. Those tables are no longer part of the active
schema or API.

## HTTP API

The API supports mailbox CRUD, email list/read/update/delete, send, drafts,
reply/forward, threads, search, folders, labels, and attachment downloads.
All mailbox routes use `requireMailbox` to resolve and authorize the mailbox
Durable Object.

## MCP

`EmailMCP` exposes only mail operations: mailbox and message listing, reading,
thread retrieval, search, draft management, sending, read state, moving, and
deleting. It has no tools for automation, files, or AI chat. Pushover
notifications are an HTTP inbound-mail side effect, not an MCP operation.

## Security

- Production HTTP requests require a valid Cloudflare Access JWT.
- Sender validation requires outbound `from` to match the selected mailbox.
- Email HTML is rendered inside a sandboxed iframe after client-side sanitizing.
- Attachment filenames are sanitized before becoming R2 keys or response headers.
- Send operations are rate-limited per mailbox.
