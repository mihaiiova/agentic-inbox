// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	index,
	type RouteConfig,
	route,
} from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("mailbox/:mailboxId", "routes/mailbox.tsx", [
		index("routes/mailbox-index.tsx"),
		route("inbox", "routes/inbox.tsx"),
		route("email/:emailId", "routes/email-detail-route.tsx"),
		route("compose", "routes/compose-route.tsx"),
		route("agent", "routes/agent-route.tsx"),
		route("settings", "routes/settings.tsx"),
		route("search", "routes/search-results.tsx"),
	]),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
