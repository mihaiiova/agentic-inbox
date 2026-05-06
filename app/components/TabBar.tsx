// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { GearSixIcon, RobotIcon, TrayIcon } from "@phosphor-icons/react";
import { NavLink, useParams } from "react-router";

const TABS = [
	{ to: "inbox", label: "Inbox", icon: TrayIcon },
	{ to: "agent", label: "Agent", icon: RobotIcon },
	{ to: "settings", label: "Settings", icon: GearSixIcon },
] as const;

interface TabBarProps {
	className?: string;
}

export default function TabBar({ className = "" }: TabBarProps) {
	const { mailboxId } = useParams<{ mailboxId: string }>();

	return (
		<nav
			className={`shrink-0 bg-kumo-base border-kumo-line flex items-center justify-around md:justify-center md:gap-6 ${className}`}
		>
			{TABS.map(({ to, label, icon: Icon }) => (
				<NavLink
					key={to}
					to={`/mailbox/${mailboxId}/${to}`}
					end={to !== "inbox"}
					className={({ isActive }) =>
						`flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-colors border-t-2 md:border-t-0 md:border-b-2 ${
							isActive
								? "border-kumo-brand text-kumo-brand"
								: "border-transparent text-kumo-subtle hover:text-kumo-default"
						}`
					}
				>
					<Icon size={18} weight="regular" />
					<span>{label}</span>
				</NavLink>
			))}
		</nav>
	);
}
