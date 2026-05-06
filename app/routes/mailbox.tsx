// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Outlet, useParams } from "react-router";
import TabBar from "~/components/TabBar";
import { useMailbox } from "~/queries/mailboxes";

export default function MailboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// Prefetch mailbox data for child components
	useMailbox(mailboxId);

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="max-w-[900px] mx-auto min-h-screen flex flex-col bg-kumo-base">
				{/* Desktop tab bar — top */}
				<TabBar className="hidden md:flex border-b" />

				{/* Main content */}
				<main className="flex-1 overflow-y-auto">
					<Outlet />
				</main>

				{/* Mobile tab bar — bottom */}
				<TabBar className="md:hidden border-t sticky bottom-0" />
			</div>
		</div>
	);
}
