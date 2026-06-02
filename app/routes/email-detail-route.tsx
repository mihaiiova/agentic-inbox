// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useParams } from "react-router";
import EmailPanel from "~/components/EmailPanel";

export default function EmailDetailRoute() {
	const { emailId } = useParams<{
		mailboxId: string;
		emailId: string;
	}>();

	if (!emailId) {
		return (
			<div className="flex items-center justify-center h-full">
				<p className="text-sm text-kumo-subtle">No email selected</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 min-h-0">
				<EmailPanel emailId={emailId} />
			</div>
		</div>
	);
}
