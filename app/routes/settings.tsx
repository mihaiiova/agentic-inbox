// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { BellIcon, CheckIcon, PlugsIcon, WrenchIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useTestNotification, useUpdateMailbox } from "~/queries/mailboxes";

const MCP_TOOLS = [
	{ name: "list_mailboxes", desc: "List all mailboxes" },
	{ name: "list_emails", desc: "List emails in a folder" },
	{ name: "get_email", desc: "Read a full email with body" },
	{ name: "get_thread", desc: "Load a conversation thread" },
	{ name: "search_emails", desc: "Search emails by query" },
	{ name: "draft_reply", desc: "Draft a reply to an email" },
	{ name: "create_draft", desc: "Create a draft email" },
	{ name: "update_draft", desc: "Update a draft email" },
	{ name: "send_reply", desc: "Send a reply" },
	{ name: "send_email", desc: "Send a new email" },
	{ name: "mark_email_read", desc: "Mark email as read/unread" },
	{ name: "move_email", desc: "Move email to a folder" },
	{ name: "delete_email", desc: "Delete an email" },
];

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard access is optional.
		}
	};

	return (
		<Button
			variant="ghost"
			shape="square"
			size="sm"
			icon={copied ? <CheckIcon size={12} /> : undefined}
			onClick={handleCopy}
			aria-label="Copy server URL"
		>
			{copied ? "Copied" : "Copy"}
		</Button>
	);
}

function MCPSection() {
	const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-app.workers.dev";
	const mcpUrl = `${baseUrl}/mcp`;

	return (
		<div className="space-y-4">
			<p className="text-xs text-kumo-subtle leading-relaxed">
				Connect an MCP client to manage mailboxes and email without enabling any
				non-mail features.
			</p>
			<div className="space-y-1.5">
				<label className="text-xs font-medium text-kumo-strong block">Server URL</label>
				<div className="flex items-center gap-2">
					<div className="flex-1 bg-kumo-recessed text-kumo-default font-mono text-[11px] px-3 py-2.5 rounded-lg border border-kumo-line break-all leading-relaxed">
						{mcpUrl}
					</div>
					<CopyButton text={mcpUrl} />
				</div>
			</div>
			<div className="space-y-2">
				<h4 className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle">
					Available mail tools
				</h4>
				<div className="border border-kumo-line rounded-lg divide-y divide-kumo-line">
					{MCP_TOOLS.map((tool) => (
						<div key={tool.name} className="flex items-center gap-2.5 px-3 py-2">
							<WrenchIcon size={12} weight="bold" className="text-kumo-brand shrink-0" />
							<span className="text-xs font-mono font-medium text-kumo-default flex-1">{tool.name}</span>
							<span className="text-[11px] text-kumo-subtle">{tool.desc}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailbox = useUpdateMailbox();
	const testNotification = useTestNotification();
	const [displayName, setDisplayName] = useState("");
	const [pushoverUserKey, setPushoverUserKey] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setPushoverUserKey(mailbox.settings?.pushoverUserKey || "");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		try {
			await updateMailbox.mutateAsync({
				mailboxId,
				settings: {
					...mailbox.settings,
					fromName: displayName.trim(),
					pushoverUserKey: pushoverUserKey.trim() || undefined,
				},
			});
			toastManager.add({ title: "Settings saved" });
		} catch {
			toastManager.add({ title: "Failed to save settings", variant: "error" });
		} finally {
			setIsSaving(false);
		}
	};

	const handleTestNotification = async () => {
		if (!mailboxId) return;
		try {
			const result = await testNotification.mutateAsync(mailboxId);
			toastManager.add({
				title: result.success ? "Test notification sent" : (result.error || "Notification failed"),
				...(result.success ? {} : { variant: "error" as const }),
			});
		} catch {
			toastManager.add({ title: "Notification request failed", variant: "error" });
		}
	};

	if (!mailbox) {
		return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	}

	return (
		<div className="w-full px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>
			<div className="space-y-6">
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">Mailbox</div>
					<div className="space-y-3">
						<Input label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center gap-2 mb-4">
						<BellIcon size={16} className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">Incoming notifications</span>
					</div>
					<div className="space-y-3">
						<Input
							label="Pushover User Key"
							placeholder="your-pushover-user-key"
							value={pushoverUserKey}
							onChange={(e) => setPushoverUserKey(e.target.value)}
						/>
						<Button
							variant="secondary"
							size="sm"
							icon={<BellIcon size={14} />}
							onClick={handleTestNotification}
							loading={testNotification.isPending}
						>
							Send Test Notification
						</Button>
						<p className="text-xs text-kumo-subtle">
							Save a Pushover user key to receive a notification when new mail arrives.
						</p>
					</div>
				</div>

				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center gap-2 mb-4">
						<PlugsIcon size={16} className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">MCP Server</span>
						<Badge variant="success">Mail only</Badge>
					</div>
					<MCPSection />
				</div>

				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>Save Changes</Button>
				</div>
			</div>
		</div>
	);
}
