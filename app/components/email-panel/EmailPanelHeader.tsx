// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge } from "@cloudflare/kumo";

interface LabelItem {
	id: string;
	name: string;
	color: string;
}

interface EmailPanelHeaderProps {
	subject: string;
	messageCount: number;
	showThreadCount: boolean;
	labels?: LabelItem[];
}

export default function EmailPanelHeader({
	subject,
	messageCount,
	showThreadCount,
	labels,
}: EmailPanelHeaderProps) {
	return (
		<div className="px-4 py-3 border-b border-kumo-line shrink-0 md:px-6">
			<h2 className="text-base font-semibold text-kumo-default">{subject}</h2>
			{labels && labels.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mt-1.5">
					{labels.map((label) => (
						<Badge key={label.id} variant={label.color as any}>
							{label.name}
						</Badge>
					))}
				</div>
			)}
			{showThreadCount && (
				<span className="text-xs text-kumo-subtle mt-0.5 block">
					{messageCount} messages in this thread
				</span>
			)}
		</div>
	);
}
