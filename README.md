# Agentic Inbox

A self-hosted email client and Model Context Protocol (MCP) server running on Cloudflare Workers.

## Features

### Email
- Receive mail through Cloudflare Email Routing
- Compose, save drafts, send, reply, reply-all, and forward
- Threaded conversations
- Search with Gmail-style operators
- Read/unread, star, archive, move, and delete
- Mail folders, labels, and email attachments
- Optional Pushover notifications for incoming mail

### MCP
The `/mcp` endpoint exposes mail operations to MCP clients such as Claude Code and Cursor:

- List mailboxes and emails
- Read messages and conversation threads
- Search mail
- Create and update drafts
- Send new messages and replies
- Mark messages read or unread
- Move and delete messages

There is no in-app AI chat, automation/rules engine, or Drive/file-browser feature. R2 is used only for mailbox metadata and email attachments required by the mail flow.

## Setup

1. Clone and deploy to Cloudflare. Copy `wrangler.jsonc.example` to `wrangler.jsonc` and configure:
   - `DOMAINS` — domains that receive mail
   - `EMAIL_ADDRESSES` — optional JSON array of allowed mailbox addresses, or `[]`
2. Configure Cloudflare Access for the deployed Worker and set `POLICY_AUD` and `TEAM_DOMAIN` secrets:
   ```bash
   wrangler secret put POLICY_AUD
   wrangler secret put TEAM_DOMAIN
   wrangler secret put PUSHOVER_APP_TOKEN
   ```
   To enable incoming notifications, set `PUSHOVER_APP_TOKEN` to a Pushover
   application token and save each mailbox's Pushover user key in Settings.
3. Configure Email Routing with a catch-all rule that forwards to this Worker.
4. Enable Cloudflare Email Service for the `send_email` binding.
5. Create a mailbox in the app.
6. Connect your MCP client to `https://your-worker.example.com/mcp`.

## Development

```bash
npm install
npm run dev
```

For local development, use `wrangler.jsonc.example` as the starting point. The R2 bucket stores mailbox records and inbound/outbound attachment blobs; it is not exposed as a separate storage product.

## Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account and a domain
- Email Routing enabled
- Email Service enabled
- Cloudflare Access configured for deployed environments

## License

Apache 2.0 — see [LICENSE](LICENSE).
