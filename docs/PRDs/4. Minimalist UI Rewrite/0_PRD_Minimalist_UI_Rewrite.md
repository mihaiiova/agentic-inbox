# Minimalist UI Rewrite

## Problem Statement

The current UI uses a multi-panel desktop layout (sidebar + header + split-view email list/detail + togglable agent sidebar) that feels complex and desktop-centric. On mobile it degrades poorly: a hamburger menu, collapsible search, hidden sidebars, and cramped split views. There are too many navigation surfaces (sidebar folders, header buttons, agent panel toggle, compose modal) and too much chrome. The user wants a radically simpler, calmer, mobile-first experience that still works well on desktop.

## Solution

Replace the entire layout with a single 900px centered column, a light Kumo background, and three primary tabs: **Inbox**, **Agent**, **Settings**. Tabs sit at the top on desktop and at the bottom on mobile. All navigation collapses into the Inbox tab via a folder `<Select>`. Email reading and composing become full-screen stack pages with a back button. The agent chat becomes its own tab. Settings absorbs the MCP panel. Remove the sidebar, header, split view, compose modal, and agent sidebar entirely.

## User Stories

1. As a user on mobile, I want the app to feel like a native mobile app with bottom navigation, so that I can reach all primary sections with my thumb.
2. As a user on desktop, I want a narrow centered column with minimal chrome, so that the interface feels calm and focused.
3. As a user, I want to switch between Inbox, Agent, and Settings using a simple tab bar, so that I always know where I am and how to get back.
4. As a user, I want to pick a folder (Inbox, Sent, Drafts, Archive, Trash, Drive, or a custom folder) from a single dropdown inside the Inbox tab, so that I don't need a permanent sidebar.
5. As a user, I want to search emails via an always-visible input at the top of the Inbox tab, so that search is immediately accessible without tapping an icon first.
6. As a user, I want to tap an email in the list and see its full content in a dedicated page, then tap back to return to the list, so that reading feels natural on both mobile and desktop.
7. As a user, I want to compose an email by tapping a floating action button in the Inbox tab, so that the primary action is always reachable.
8. As a user, I want the Agent tab to contain only the chat interface, so that it feels like a clean assistant conversation.
9. As a user, I want the MCP connection details to live inside the Settings tab, so that all configuration is in one place.
10. As a user, I want the mailbox list to be a standalone landing page before entering the 3-tab layout, so that the tab bar only appears once I'm inside a mailbox.
11. As a user, I want the URL to reflect the current tab and the current stack page (email detail, compose), so that deep-linking and browser back/forward work correctly.
12. As a user, I want the UI to use Kumo design tokens exclusively, so that the app remains consistent with the design system and easy to maintain.

## Implementation Decisions

- **Layout Shell**: A new `MinimalLayout` component wraps all `/mailbox/:mailboxId/*` routes. It provides a full-bleed `bg-kumo-recessed` background and a centered `max-w-[900px]` flex column. The tab bar is rendered twice: once at the top (hidden on mobile) and once at the bottom (hidden on desktop). The main content area scrolls independently.
- **Tab Bar**: Three tabs using Kumo `Button` components with icons and labels. Active state uses `text-kumo-brand` plus a border indicator (bottom on desktop, top on mobile). The tab bar is a navigation primitive, not a router tab component — each tab is a `NavLink` to its route.
- **Route Structure**: New routes are introduced under `/mailbox/:mailboxId`:
  - `/inbox` (default) — renders the Inbox tab with folder select, search, and content area.
  - `/inbox/:folderId` — same tab, different folder content.
  - `/drive` — same tab, Drive content (still reachable by selecting "Drive" in the folder select).
  - `/email/:emailId` — full-screen email detail (stack page).
  - `/compose` — full-screen compose page (stack page).
  - `/agent` — Agent tab.
  - `/settings` — Settings tab.
  The mailbox list page at `/` remains a standalone landing page outside the `MinimalLayout`.
- **Inbox Tab**: A single route component that orchestrates:
  - A Kumo `Input` for search, always visible at the top.
  - A Kumo `Select` for folder switching. Options include system folders, "Drive" as the second option after "Inbox", and custom folders fetched dynamically.
  - A content area that renders the email list, Drive file list, or search results depending on the selected folder and search query.
  - A floating compose button (FAB) using Kumo `Button` `variant="primary"` with a pencil icon, positioned at the bottom-right of the scrollable content area.
- **Email List**: The existing email list logic is preserved but the UI is simplified. Rows no longer coexist with a detail panel. Clicking a row navigates to `/email/:emailId`. Hover actions are kept but adapted for the single-column layout.
- **Email Detail**: The existing `EmailPanel` content is adapted to full width. A back button (top-left, `CaretLeftIcon`) navigates back to the Inbox tab. Thread messages and attachments render as before.
- **Compose**: The existing compose form is adapted to full width. A back button cancels compose and returns to the previous page. The existing `useUIStore` compose state (`startCompose`, `closeCompose`, `composeOptions`) is retained so that the Agent tab can still trigger compose programmatically.
- **Agent Tab**: Renders the existing `AgentPanel` chat component directly, full width, without the `AgentSidebar` wrapper. No sub-tabs.
- **Settings Tab**: The existing Settings page is preserved and expanded. The content of `MCPPanel` (server URL, available tools list, copy button) is added as a new card/section at the bottom of the Settings page, below Notifications. The standalone `MCPPanel` component is removed.
- **Component Removal**: The following components are deleted entirely because their responsibilities are absorbed into the new layout:
  - `Sidebar`
  - `Header`
  - `AgentSidebar`
  - `MailboxSplitView`
  - `ComposeEmail` (modal variant)
  - `MCPPanel`
- **UI Store Cleanup**: The Zustand store is simplified by removing state and actions related to the removed UI surfaces:
  - Remove: `isSidebarOpen`, `openSidebar`, `closeSidebar`, `toggleSidebar`
  - Remove: `isAgentPanelOpen`, `toggleAgentPanel`
  - Remove: `isComposeModalOpen`, `openComposeModal`, `closeComposeModal`
  - Keep: `selectedEmailId`, `selectEmail`, `closePanel`, `isComposing`, `startCompose`, `closeCompose`, `composeOptions`
- **Styling**: Kumo tokens are used for all colors, borders, and typography. No custom color values. The layout uses standard Tailwind utility classes for structural concerns (flex, max-width, overflow, positioning).

## Testing Decisions

- **Route rendering**: Verify that each tab route (`/inbox`, `/agent`, `/settings`) renders the correct top-level content.
- **Navigation flow**: Test Inbox → select email → email detail → back → Inbox. Test folder select changes the rendered content. Test compose FAB opens the compose page.
- **Responsive layout**: Verify the tab bar renders at the bottom on mobile viewports and at the top on desktop viewports.
- **Settings integration**: Verify the MCP section renders in Settings and that the copy-to-clipboard button works.
- **No regression in agent chat**: The Agent tab should continue to connect to the agent and send/receive messages.
- **No regression in email actions**: Mark read/unread, star, delete, move — all actions in the email list and detail should continue to work.
- Prior art: The existing `tests/utils-plaintext.test.ts` shows the testing setup with Vitest. New tests should follow the same patterns.

## Task Status

| Task # | Task Name | Status | Link / Filename |
|--------|-----------|--------|-----------------|

## Out of Scope

- Visual design individualization (custom colors, fonts, spacing beyond Kumo tokens). This is intentionally deferred.
- Custom folder overflow handling in the `<Select>` (e.g., search inside the dropdown, nested folders). Deferred to a later iteration.
- Auto-carrying email context from Inbox to Agent tab. The agent must still reference emails explicitly.
- Mailbox creation/editing UI changes. The mailbox list page is unchanged beyond being the standalone landing page.
- Drive file preview or viewer. Download and delete remain the only actions.
- Search query syntax improvements. The search input behavior is unchanged.

## Further Notes

- **Kumo dependency**: This rewrite assumes Kumo components (`Button`, `Input`, `Select`, `Dialog`, `Badge`, etc.) continue to work as-is inside the new layout. If any Kumo component assumes a specific parent layout (e.g., full-width header), it may need minor adjustments.
- **Back button behavior**: On stack pages (email detail, compose), the back button should use `navigate(-1)` where appropriate, but explicit routing back to `/mailbox/:mailboxId/inbox` is safer to guarantee landing in the correct tab.
- **Compose state**: Because `useUIStore` still manages compose options, the Agent tab can trigger compose by calling `startCompose()` and then navigating to `/compose`. This bridge should be verified during implementation.
- **Mobile FAB positioning**: The compose FAB should be positioned within the scrollable content area (not fixed to the viewport) to avoid covering the bottom tab bar on mobile. Alternatively, if placed fixed, it must sit above the tab bar with sufficient margin.
- **Risk**: The `EmailPanel` and `ComposePanel` components were designed for a split-view context. Adapting them to full-width may reveal layout assumptions (e.g., internal max-widths, margin expectations). These should be tested visually.
