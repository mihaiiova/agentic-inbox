// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import AgentPanel from "~/components/AgentPanel";

export default function AgentRoute() {
	return (
		<div className="flex flex-col h-full">
			<AgentPanel />
		</div>
	);
}
