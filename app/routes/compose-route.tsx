// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { useNavigate, useParams } from "react-router";
import ComposePanel from "~/components/ComposePanel";

export default function ComposeRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();

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

			{/* Compose form */}
			<div className="flex-1 overflow-hidden">
				<ComposePanel />
			</div>
		</div>
	);
}
