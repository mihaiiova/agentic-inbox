# Agentic Inbox

A fork of [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox) — a self-hosted email client with an AI agent, running entirely on Cloudflare Workers.

## Features

### Email
- Compose, reply, reply-all, and forward with a rich text editor
- Drafts — save, edit, and send
- Threading — In-Reply-To/References headers plus subject-based matching
- Star, read/unread, trash, and archive

### Search
- Gmail-style operators: `from:`, `to:`, `subject:`, `in:`, `is:`, `has:attachment`, `before:`, `after:`
- Results highlighted inline, with folder badges

### Organization
- System folders — inbox, sent, drafts, archive, trash, spam
- Custom folders with rename and delete
- Labels with custom colors

### Rules Engine
- Conditions on `from`, `to`, `cc`, `subject`, and `body`
- Operators: `contains`, `equals`, `starts_with`, `ends_with`, `matches` (regex), and `classification` (AI-powered)
- Static rules with AND/OR logic, plus agent rules evaluated with natural language
- Actions: add a label, save attachments to Drive, or send a Pushover notification
- Rules fire automatically on every inbound email with per-rule evaluation logs

### Attachments & Drive
- Attachments extracted from inbound emails, stored in R2
- Preview (images) and download
- Embedded Drive — rules can auto-save attachments; browse, download, or delete files

### AI Agent
- Chat-based agent with 14 tools — read, search, draft replies, create rules, classify, and more
- Auto-drafts replies on new emails (always requires explicit approval to send)
- Per-mailbox custom system prompts
- Prompt injection scanning and draft verification for safety

### MCP Server
- Full email operations exposed as MCP tools for AI coding tools like Claude Code and Cursor
- Tools include list, read, search, draft, send, move, and drive operations

### Notifications
- Pushover push notifications via rule actions
- Per-mailbox Pushover user key in settings

### Security
- Cloudflare Access JWT authentication (required in production)
- Prompt injection scanning on inbound emails
- Sender validation (from address must match the mailbox)

## How to setup

Watch the setup video: [https://www.youtube.com/watch?v=Bf_cEzAIUPU](https://www.youtube.com/watch?v=Bf_cEzAIUPU)

### To set up

1. Clone and deploy to Cloudflare. The deploy flow will automatically provision R2, Durable Objects, and Workers AI.

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agentic-inbox)

     After deploying, copy `wrangler.jsonc.example` to `wrangler.jsonc` and update the vars:
     - `DOMAINS` — the domain(s) you want to receive emails for (e.g. `example.com`)
     - `EMAIL_ADDRESSES` — allowed inbound addresses as a JSON array, or `[]` for all addresses on the configured domains
     - `APP_BASE_URL` — your worker's public URL (e.g. `https://agentic-inbox.your-account.workers.dev`)

2. **Configure Cloudflare Access** — Enable [one-click Cloudflare Access](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/) on your Worker under Settings > Domains & Routes. The modal will show your `POLICY_AUD` and `TEAM_DOMAIN` values. `TEAM_DOMAIN` can be either your Access team URL or the full `.../cdn-cgi/access/certs` URL. **You must set these as secrets for your Worker.**
3. **Set up Email Routing** — In the Cloudflare dashboard, go to your domain > Email Routing and create a catch-all rule that forwards to this Worker
4. **Enable Email Service** — The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
5. **Create a mailbox** — Visit your deployed app and create a mailbox for any address on your domain (e.g. `hello@example.com`)

### Troubleshooting Access

1. If you see `Invalid or expired Access token`, that usually means `POLICY_AUD` or `TEAM_DOMAIN` secrets are incorrect.
   * Resolution: [turn Access off and back on for the Worker to get the Access modal again](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then reset your Worker secrets to the latest `POLICY_AUD` and `TEAM_DOMAIN` values shown there.
2. If you see `Cloudflare Access must be configured in production`, this application is intentionally enforcing Cloudflare Access so your inbox is not exposed to anyone on the internet.
   * Resolution: enable Access using [one-click Cloudflare Access for Workers](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then set the `POLICY_AUD` and `TEAM_DOMAIN` Worker secrets from the modal values.

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Copy `wrangler.jsonc.example` to `wrangler.jsonc` and update the vars for your deployment:
   - `DOMAINS` — comma-separated list of domains you want to receive emails for (e.g. `example.com,another.com`)
   - `EMAIL_ADDRESSES` — JSON array of allowed inbound addresses (e.g. `["hello@example.com"]`), or `[]` to allow all addresses on the configured domains
   - `APP_BASE_URL` — public URL of your deployed worker (e.g. `https://agentic-inbox.your-account.workers.dev`), used for clickable links in Pushover notifications
2. Create an R2 bucket named `agentic-inbox`: `wrangler r2 bucket create agentic-inbox`

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured for deployed/shared environments (required in production)

## License

Apache 2.0 — see [LICENSE](LICENSE).
