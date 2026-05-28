// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { useNavigate, useParams } from "react-router";
import EmailPanel from "~/components/EmailPanel";

export default function EmailDetailRoute() {
	const { mailboxId, emailId } = useParams<{
		mailboxId: string;
		emailId: string;
	}>();
	const navigate = useNavigate();

	if (!emailId) {
		return (
			<div className="flex items-center justify-center h-full">
				<p className="text-sm text-kumo-subtle">No email selected</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Back button */}
			<div className="flex items-center px-4 py-2 border-b border-kumo-line shrink-0">
				<Button
					variant="ghost"
					size="sm"
					icon={<CaretLeftIcon size={16} />}
					onClick={() => navigate(`/mailbox/${mailboxId}/inbox`)}
				>
					Back
				</Button>
			</div>

			{/* Email content */}
			<div className="flex-1 min-h-0">
				<EmailPanel emailId={emailId} />
			</div>
		</div>
	);
}
