// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon, PlusIcon, TagIcon, TrashIcon, FadersIcon, PencilSimpleIcon, XIcon, BellIcon, ScrollIcon, CheckIcon, CopyIcon, PlugsIcon, WrenchIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { useLabels, useCreateLabel, useDeleteLabel } from "~/queries/labels";
import { useRules, useCreateRule, useUpdateRule, useDeleteRule, useRuleLogs } from "~/queries/rules";
import { formatDetailDate } from "../../shared/dates";
import type { RuleCondition, RuleLog } from "~/types";

export function getRuleActionText(
	actionType: string,
	params: Record<string, unknown>,
	labels: Array<{ id: string; name: string }>,
): string {
	if (actionType === "add_label") {
		const label = labels.find((l) => l.id === params.label_id);
		return label ? `Add label "${label.name}"` : "Add label (deleted)";
	}
	if (actionType === "save_attachment") {
		return "Save attachments to Drive";
	}
	if (actionType === "send_notification") {
		return "Send Pushover notification";
	}
	return actionType;
}

// Placeholder shown in the textarea when no custom prompt is set.
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

const BADGE_VARIANTS = [
	{ value: "primary", label: "Blue" },
	{ value: "secondary", label: "Gray" },
	{ value: "success", label: "Green" },
	{ value: "warning", label: "Amber" },
	{ value: "destructive", label: "Red" },
	{ value: "info", label: "Cyan" },
	{ value: "beta", label: "Purple" },
] as const;

const CONDITION_FIELDS = [
	{ value: "from", label: "From" },
	{ value: "to", label: "To" },
	{ value: "cc", label: "CC" },
	{ value: "subject", label: "Subject" },
	{ value: "body", label: "Body" },
] as const;

const CONDITION_OPERATORS = [
	{ value: "contains", label: "Contains" },
	{ value: "equals", label: "Equals" },
	{ value: "starts_with", label: "Starts with" },
	{ value: "ends_with", label: "Ends with" },
	{ value: "matches", label: "Matches regex" },
	{ value: "classification", label: "AI Classification" },
] as const;

function LabelColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	return (
		<div className="flex flex-wrap gap-2">
			{BADGE_VARIANTS.map((v) => (
				<button
					key={v.value}
					type="button"
					onClick={() => onChange(v.value)}
					className={`cursor-pointer bg-transparent border-0 p-0 ${value === v.value ? "ring-2 ring-kumo-brand rounded-md" : ""}`}
				>
					<Badge variant={v.value as any}>{v.label}</Badge>
				</button>
			))}
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	const variants: Record<string, { variant: "primary" | "secondary" | "success" | "warning" | "destructive" | "info" | "beta"; label: string }> = {
		matched: { variant: "info", label: "Matched" },
		not_matched: { variant: "secondary", label: "No match" },
		success: { variant: "success", label: "Success" },
		failed: { variant: "destructive", label: "Failed" },
	};
	const config = variants[status] || { variant: "secondary", label: status };
	return <Badge variant={config.variant as any}>{config.label}</Badge>;
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API unavailable or permission denied — ignore silently
		}
	};

	return (
		<Button
			variant="ghost"
			shape="square"
			size="sm"
			icon={
				copied ? (
					<CheckIcon size={12} weight="bold" className="text-kumo-success" />
				) : (
					<CopyIcon size={12} />
				)
			}
			onClick={handleCopy}
			aria-label="Copy to clipboard"
		/>
	);
}

const MCP_TOOLS = [
	{ name: "list_mailboxes", desc: "List all mailboxes" },
	{ name: "list_emails", desc: "List emails in a folder" },
	{ name: "get_email", desc: "Read a full email with body" },
	{ name: "get_thread", desc: "Load a conversation thread" },
	{ name: "search_emails", desc: "Search emails by query" },
	{ name: "draft_reply", desc: "Draft a reply to an email" },
	{ name: "send_reply", desc: "Send a reply" },
	{ name: "send_email", desc: "Send a new email" },
	{ name: "mark_email_read", desc: "Mark email as read/unread" },
	{ name: "move_email", desc: "Move email to a folder" },
	{ name: "list_drive_files", desc: "List drive files" },
	{ name: "get_drive_file", desc: "Get drive file metadata" },
	{ name: "delete_drive_file", desc: "Delete a drive file" },
];

function MCPSection() {
	const baseUrl =
		typeof window !== "undefined" ? window.location.origin : "https://your-app.workers.dev";
	const mcpUrl = `${baseUrl}/mcp`;

	return (
		<div className="space-y-4">
			<p className="text-xs text-kumo-subtle leading-relaxed">
				This email agent exposes an MCP server so AI coding assistants can manage
				your inbox directly — read emails, search, draft replies, and send messages
				using natural language.
			</p>

			<div className="space-y-1.5">
				<label className="text-xs font-medium text-kumo-strong block">
					Server URL
				</label>
				<div className="relative group">
					<div className="absolute right-1.5 top-1/2 -translate-y-1/2">
						<CopyButton text={mcpUrl} />
					</div>
					<div className="bg-kumo-recessed text-kumo-default font-mono text-[11px] px-3 py-2.5 pr-10 rounded-lg border border-kumo-line break-all leading-relaxed">
						{mcpUrl}
					</div>
				</div>
			</div>

			<div className="space-y-2">
				<h4 className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle px-0.5">
					Available Tools
				</h4>
				<div className="border border-kumo-line rounded-lg divide-y divide-kumo-line">
					{MCP_TOOLS.map((tool) => (
						<div
							key={tool.name}
							className="flex items-center gap-2.5 px-3 py-2"
						>
							<WrenchIcon
								size={12}
								weight="bold"
								className="text-kumo-brand shrink-0"
							/>
							<div className="min-w-0 flex-1">
								<span className="text-xs font-mono font-medium text-kumo-default">
									{tool.name}
								</span>
							</div>
							<span className="text-[11px] text-kumo-subtle shrink-0">
								{tool.desc}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function RuleLogsSection({ mailboxId }: { mailboxId: string | undefined }) {
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const limit = 50;
	const { data: logs = [], isLoading } = useRuleLogs(mailboxId, page, limit);

	if (isLoading) {
		return <Loader size="sm" />;
	}

	if (logs.length === 0) {
		return <p className="text-xs text-kumo-subtle">No rule executions yet. Logs appear when rules are evaluated against incoming emails.</p>;
	}

	return (
		<div className="space-y-2">
			<div className="overflow-x-auto">
				<table className="w-full text-xs">
					<thead>
						<tr className="border-b border-kumo-line text-kumo-subtle">
							<th className="text-left py-1.5 px-2 font-medium">Time</th>
							<th className="text-left py-1.5 px-2 font-medium">Rule</th>
							<th className="text-left py-1.5 px-2 font-medium">Type</th>
							<th className="text-left py-1.5 px-2 font-medium">Action</th>
							<th className="text-left py-1.5 px-2 font-medium">Status</th>
						</tr>
					</thead>
					<tbody>
						{logs.map((log: RuleLog) => (
							<>
								<tr
									key={log.id}
									className="border-b border-kumo-line/50 cursor-pointer hover:bg-kumo-fill/30"
									onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
								>
									<td className="py-1.5 px-2 text-kumo-subtle whitespace-nowrap">
										{formatDetailDate(log.created_at)}
									</td>
									<td className="py-1.5 px-2 text-kumo-default">
										{log.rule_name || (log.rule_id ? log.rule_id.slice(0, 8) : "—")}
										{log.rule_name && log.rule_id && (
											<span className="block text-[10px] text-kumo-subtle">{log.rule_id.slice(0, 8)}</span>
										)}
									</td>
									<td className="py-1.5 px-2">
										<Badge variant={log.rule_type === "agent" ? "beta" : "secondary"}>
											{log.rule_type === "agent" ? "Agent" : "Static"}
										</Badge>
									</td>
									<td className="py-1.5 px-2 text-kumo-default">{log.action_type}</td>
									<td className="py-1.5 px-2">
										<StatusBadge status={log.status} />
									</td>
								</tr>
								{expandedId === log.id && (
									<tr>
										<td colSpan={5} className="py-2 px-2 bg-kumo-recessed">
											<pre className="text-[11px] text-kumo-subtle whitespace-pre-wrap break-all">
												{(() => {
													try {
														return JSON.stringify(JSON.parse(log.details), null, 2);
													} catch {
														return log.details;
													}
												})()}
											</pre>
										</td>
									</tr>
								)}
							</>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex items-center justify-between pt-2">
				<Button
					variant="ghost"
					size="sm"
					disabled={page <= 1}
					onClick={() => setPage((p) => Math.max(1, p - 1))}
				>
					Previous
				</Button>
				<span className="text-xs text-kumo-subtle">Page {page}</span>
				<Button
					variant="ghost"
					size="sm"
					disabled={logs.length < limit}
					onClick={() => setPage((p) => p + 1)}
				>
					Next
				</Button>
			</div>
		</div>
	);
}

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const { data: labels = [] } = useLabels(mailboxId);
	const createLabelMutation = useCreateLabel();
	const deleteLabelMutation = useDeleteLabel();

	const { data: rules = [] } = useRules(mailboxId);
	const createRuleMutation = useCreateRule();
	const updateRuleMutation = useUpdateRule();
	const deleteRuleMutation = useDeleteRule();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [pushoverUserKey, setPushoverUserKey] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	// Label form state
	const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
	const [newLabelName, setNewLabelName] = useState("");
	const [newLabelColor, setNewLabelColor] = useState("primary");
	const [isCreatingLabel, setIsCreatingLabel] = useState(false);

	// Rule form state
	const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
	const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
	const [ruleName, setRuleName] = useState("");
	const [ruleType, setRuleType] = useState<"static" | "agent">("static");
	const [ruleEnabled, setRuleEnabled] = useState(true);
	const [ruleMatchAll, setRuleMatchAll] = useState(true);
	const [ruleConditions, setRuleConditions] = useState<RuleCondition[]>([
		{ field: "from", operator: "contains", value: "" },
	]);
	const [ruleAgentPrompt, setRuleAgentPrompt] = useState("");
	const [ruleActionType, setRuleActionType] = useState("add_label");
	const [ruleActionLabelId, setRuleActionLabelId] = useState("");
	const [ruleActionPushoverTitle, setRuleActionPushoverTitle] = useState("");
	const [ruleActionPushoverMessage, setRuleActionPushoverMessage] = useState("");
	const [isSavingRule, setIsSavingRule] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setPushoverUserKey(mailbox.settings?.pushoverUserKey || "");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			pushoverUserKey: pushoverUserKey.trim() || undefined,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	const handleCreateLabel = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!mailboxId || !newLabelName.trim()) return;
		setIsCreatingLabel(true);
		try {
			await createLabelMutation.mutateAsync({
				mailboxId,
				name: newLabelName.trim(),
				color: newLabelColor,
			});
			toastManager.add({ title: "Label created" });
			setNewLabelName("");
			setNewLabelColor("primary");
			setIsLabelDialogOpen(false);
		} catch {
			toastManager.add({ title: "Failed to create label", variant: "error" });
		} finally {
			setIsCreatingLabel(false);
		}
	};

	const handleDeleteLabel = async (id: string) => {
		if (!mailboxId) return;
		if (!window.confirm("Delete this label? It will be removed from all emails.")) return;
		try {
			await deleteLabelMutation.mutateAsync({ mailboxId, id });
			toastManager.add({ title: "Label deleted" });
		} catch {
			toastManager.add({ title: "Failed to delete label", variant: "error" });
		}
	};

	const resetRuleForm = () => {
		setEditingRuleId(null);
		setRuleName("");
		setRuleType("static");
		setRuleEnabled(true);
		setRuleMatchAll(true);
		setRuleConditions([{ field: "from", operator: "contains", value: "" }]);
		setRuleAgentPrompt("");
		setRuleActionType("add_label");
		setRuleActionLabelId("");
		setRuleActionPushoverTitle("");
		setRuleActionPushoverMessage("");
	};

	const openEditRule = (rule: import("~/types").Rule) => {
		setEditingRuleId(rule.id);
		setRuleName(rule.name);
		setRuleType(rule.type as "static" | "agent");
		setRuleEnabled(!!rule.enabled);
		setRuleMatchAll(!!rule.match_all);
		try {
			setRuleConditions(JSON.parse(rule.conditions) as RuleCondition[]);
		} catch {
			setRuleConditions([]);
		}
		setRuleAgentPrompt(rule.agent_prompt || "");
		setRuleActionType(rule.action_type);
		try {
			const params = JSON.parse(rule.action_params) as Record<string, unknown>;
			setRuleActionLabelId((params.label_id as string) || "");
			setRuleActionPushoverTitle((params.title as string) || "");
			setRuleActionPushoverMessage((params.message as string) || "");
		} catch {
			setRuleActionLabelId("");
			setRuleActionPushoverTitle("");
			setRuleActionPushoverMessage("");
		}
		setIsRuleDialogOpen(true);
	};

	const handleSaveRule = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!mailboxId || !ruleName.trim()) return;
		if (ruleType === "static" && ruleConditions.some((c) => !c.value.trim())) {
			toastManager.add({ title: "All conditions must have a value", variant: "error" });
			return;
		}
		if (ruleType === "agent" && !ruleAgentPrompt.trim()) {
			toastManager.add({ title: "Agent prompt is required", variant: "error" });
			return;
		}
		if (ruleActionType === "add_label" && !ruleActionLabelId) {
			toastManager.add({ title: "Select a label for this rule", variant: "error" });
			return;
		}
		setIsSavingRule(true);
		try {
			const actionParams: Record<string, unknown> = {};
			if (ruleActionType === "add_label") {
				actionParams.label_id = ruleActionLabelId;
			}
			if (ruleActionType === "send_notification") {
				if (ruleActionPushoverTitle.trim()) actionParams.title = ruleActionPushoverTitle.trim();
				if (ruleActionPushoverMessage.trim()) actionParams.message = ruleActionPushoverMessage.trim();
			}
			if (editingRuleId) {
				await updateRuleMutation.mutateAsync({
					mailboxId,
					id: editingRuleId,
					updates: {
						name: ruleName.trim(),
						type: ruleType,
						enabled: ruleEnabled,
						match_all: ruleMatchAll,
						conditions: ruleConditions,
						agent_prompt: ruleAgentPrompt,
						action_type: ruleActionType,
						action_params: actionParams,
					},
				});
				toastManager.add({ title: "Rule updated" });
			} else {
				await createRuleMutation.mutateAsync({
					mailboxId,
					rule: {
						name: ruleName.trim(),
						type: ruleType,
						enabled: ruleEnabled,
						match_all: ruleMatchAll,
						conditions: ruleConditions,
						agent_prompt: ruleAgentPrompt,
						action_type: ruleActionType,
						action_params: actionParams,
					},
				});
				toastManager.add({ title: "Rule created" });
			}
			resetRuleForm();
			setIsRuleDialogOpen(false);
		} catch {
			toastManager.add({ title: "Failed to save rule", variant: "error" });
		} finally {
			setIsSavingRule(false);
		}
	};

	const handleDeleteRule = async (id: string) => {
		if (!mailboxId) return;
		if (!window.confirm("Delete this rule?")) return;
		try {
			await deleteRuleMutation.mutateAsync({ mailboxId, id });
			toastManager.add({ title: "Rule deleted" });
		} catch {
			toastManager.add({ title: "Failed to delete rule", variant: "error" });
		}
	};

	const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
		setRuleConditions((prev) =>
			prev.map((c, i) => (i === index ? { ...c, ...updates } : c)),
		);
	};

	const removeCondition = (index: number) => {
		setRuleConditions((prev) => prev.filter((_, i) => i !== index));
	};

	const addCondition = () => {
		setRuleConditions((prev) => [
			...prev,
			{ field: "from", operator: "contains", value: "" },
		]);
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="w-full px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">Account</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Labels */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<TagIcon size={16} className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">Labels</span>
						</div>
						<Button
							variant="ghost"
							size="sm"
							icon={<PlusIcon size={14} />}
							onClick={() => setIsLabelDialogOpen(true)}
						>
							New Label
						</Button>
					</div>
					{labels.length === 0 ? (
						<p className="text-xs text-kumo-subtle">No labels yet. Create labels to use them in rules.</p>
					) : (
						<div className="flex flex-wrap gap-2">
							{labels.map((label) => (
								<div
									key={label.id}
									className="group flex items-center gap-1.5 px-2 py-1 rounded-md border border-kumo-line bg-kumo-recessed"
								>
									<Badge variant={label.color as any}>{label.name}</Badge>
									<button
										type="button"
										onClick={() => handleDeleteLabel(label.id)}
										className="opacity-0 group-hover:opacity-100 cursor-pointer bg-transparent border-0 p-0.5 text-kumo-subtle hover:text-kumo-destructive transition-opacity"
										aria-label={`Delete label ${label.name}`}
									>
										<XIcon size={12} />
									</button>
								</div>
							))}
							</div>
						)}
					</div>

				{/* Rules */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<FadersIcon size={16} className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">Rules</span>
						</div>
						<Button
							variant="ghost"
							size="sm"
							icon={<PlusIcon size={14} />}
							onClick={() => {
								resetRuleForm();
								setIsRuleDialogOpen(true);
							}}
						>
							New Rule
						</Button>
					</div>
					{rules.length === 0 ? (
						<p className="text-xs text-kumo-subtle">
							No rules yet. Rules automatically organize incoming emails based on conditions.
						</p>
					) : (
						<div className="space-y-2">
							{rules.map((rule) => {
								let conditionsText = "";
								let actionText = "";
								try {
									const conds = JSON.parse(rule.conditions) as RuleCondition[];
									conditionsText = conds
										.map((c) => c.operator === "classification" ? `AI: "${c.value}"` : `${c.field} ${c.operator} "${c.value}"`)
										.join(rule.match_all ? " AND " : " OR ");
								} catch {
									conditionsText = "Invalid conditions";
								}
								if (rule.type === "agent" && rule.agent_prompt) {
									conditionsText = `AI: "${rule.agent_prompt}"`;
								}
								try {
									const params = JSON.parse(rule.action_params) as Record<string, unknown>;
									actionText = getRuleActionText(rule.action_type, params, labels);
								} catch {
									actionText = rule.action_type;
								}
								return (
									<div
										key={rule.id}
										className="flex items-start gap-3 p-3 rounded-md border border-kumo-line bg-kumo-recessed"
									>
										<div className="pt-0.5">
											<label className="cursor-pointer">
												<input
													type="checkbox"
													checked={!!rule.enabled}
													onChange={(e) => {
														if (!mailboxId) return;
														updateRuleMutation.mutate({
															mailboxId,
															id: rule.id,
															updates: { enabled: e.target.checked },
														});
													}}
													className="sr-only peer"
												/>
												<span className="block w-8 h-5 rounded-full bg-kumo-line peer-checked:bg-kumo-brand transition-colors relative">
													<span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-3" />
												</span>
											</label>
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<div className="text-sm font-medium text-kumo-default">
													{rule.name}
												</div>
												<Badge variant={rule.type === "agent" ? "beta" : "secondary"}>
													{rule.type === "agent" ? "Agent" : "Static"}
												</Badge>
											</div>
											<div className="text-xs text-kumo-subtle mt-0.5">
												IF {conditionsText}
											</div>
											<div className="text-xs text-kumo-strong mt-0.5">
												THEN {actionText}
											</div>
										</div>
										<div className="flex items-center gap-1 shrink-0">
											<Button
												variant="ghost"
												shape="square"
												size="sm"
												icon={<PencilSimpleIcon size={14} />}
												onClick={() => openEditRule(rule)}
												aria-label="Edit rule"
											/>
											<Button
												variant="ghost"
												shape="square"
												size="sm"
												icon={<TrashIcon size={14} />}
												onClick={() => handleDeleteRule(rule.id)}
												aria-label="Delete rule"
											/>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Rule Logs */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<ScrollIcon size={16} className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">Rule Logs</span>
						</div>
					</div>
					<RuleLogsSection mailboxId={mailboxId} />
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">AI Agent Prompt</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="sm"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model.
						It controls the agent&apos;s personality, writing style, and behavior rules.
					</p>
				</div>

				{/* Notifications */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center gap-2 mb-4">
						<BellIcon size={16} className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">Notifications</span>
					</div>
					<div className="space-y-3">
						<Input
							label="Pushover User Key"
							placeholder="your-pushover-user-key"
							value={pushoverUserKey}
							onChange={(e) => setPushoverUserKey(e.target.value)}
						/>
						<p className="text-xs text-kumo-subtle">
							Used by rules with the &quot;Send Pushover notification&quot; action.
							<a
								href="https://pushover.net/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-kumo-brand underline"
							>
								Get a Pushover account
							</a>
						</p>
					</div>
				</div>

			{/* MCP Server */}
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
				<div className="flex items-center gap-2 mb-4">
					<PlugsIcon size={16} className="text-kumo-subtle" />
					<span className="text-sm font-medium text-kumo-default">MCP Server</span>
				</div>
				<MCPSection />
			</div>

			{/* Save */}
			<div className="flex justify-end">
				<Button variant="primary" onClick={handleSave} loading={isSaving}>
					Save Changes
				</Button>
			</div>
		</div>

			{/* Label Dialog */}
			<Dialog.Root open={isLabelDialogOpen} onOpenChange={setIsLabelDialogOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-4">Create Label</Dialog.Title>
					<form onSubmit={handleCreateLabel} className="space-y-4">
						<Input
							label="Name"
							placeholder="e.g. Important"
							value={newLabelName}
							onChange={(e) => setNewLabelName(e.target.value)}
							required
						/>
						<div>
							<span className="text-sm font-medium text-kumo-default mb-1.5 block">Color</span>
							<LabelColorPicker value={newLabelColor} onChange={setNewLabelColor} />
						</div>
						<div className="flex justify-end gap-2">
							<Dialog.Close
								render={(props) => (
									<Button {...props} variant="secondary" size="sm">
										Cancel
									</Button>
								)}
							/>
							<Button type="submit" variant="primary" size="sm" loading={isCreatingLabel}>
								Create
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			{/* Rule Dialog */}
			<Dialog.Root open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
				<Dialog size="lg" className="p-6 max-h-[90vh] overflow-y-auto">
					<Dialog.Title className="text-base font-semibold mb-4">
						{editingRuleId ? "Edit Rule" : "New Rule"}
					</Dialog.Title>
					<form onSubmit={handleSaveRule} className="space-y-4">
						<Input
							label="Rule Name"
							placeholder="e.g. Label invoices"
							value={ruleName}
							onChange={(e) => setRuleName(e.target.value)}
							required
						/>

						<div>
							<div className="text-sm font-medium text-kumo-default mb-2">Rule Type</div>
							<div className="flex items-center gap-4">
								<label className="flex items-center gap-2 text-sm text-kumo-default cursor-pointer">
									<input
										type="radio"
										name="ruleType"
										checked={ruleType === "static"}
										onChange={() => setRuleType("static")}
										className="rounded border-kumo-line"
									/>
									Static (conditions)
								</label>
								<label className="flex items-center gap-2 text-sm text-kumo-default cursor-pointer">
									<input
										type="radio"
										name="ruleType"
										checked={ruleType === "agent"}
										onChange={() => setRuleType("agent")}
										className="rounded border-kumo-line"
									/>
									Agent (AI prompt)
								</label>
							</div>
						</div>

						<div className="flex items-center gap-4">
							<label className="flex items-center gap-2 text-sm text-kumo-default cursor-pointer">
								<input
									type="checkbox"
									checked={ruleEnabled}
									onChange={(e) => setRuleEnabled(e.target.checked)}
									className="rounded border-kumo-line"
								/>
								Enabled
							</label>
							{ruleType === "static" && (
								<label className="flex items-center gap-2 text-sm text-kumo-default cursor-pointer">
									<input
										type="checkbox"
										checked={ruleMatchAll}
										onChange={(e) => setRuleMatchAll(e.target.checked)}
										className="rounded border-kumo-line"
									/>
									Match all conditions
								</label>
							)}
						</div>

						{ruleType === "static" ? (
							<div>
								<div className="text-sm font-medium text-kumo-default mb-2">Conditions</div>
								<div className="space-y-2">
									{ruleConditions.map((condition, index) => (
										<div key={index} className="flex items-center gap-2">
											<Select
												value={condition.field}
												onValueChange={(v) =>
													updateCondition(index, { field: v as RuleCondition["field"] })
												}
											>
												{CONDITION_FIELDS.map((f) => (
													<Select.Option key={f.value} value={f.value}>
														{f.label}
													</Select.Option>
												))}
											</Select>
											<Select
												value={condition.operator}
												onValueChange={(v) =>
													updateCondition(index, { operator: v as RuleCondition["operator"] })
												}
											>
												{CONDITION_OPERATORS.map((o) => (
													<Select.Option key={o.value} value={o.value}>
														{o.label}
													</Select.Option>
												))}
											</Select>
											<Input
												placeholder={condition.operator === "classification" ? "AI prompt, e.g. is this an invoice?" : "Value"}
												value={condition.value}
												onChange={(e) =>
													updateCondition(index, { value: e.target.value })
												}
												className="flex-1"
											/>
											{ruleConditions.length > 1 && (
												<Button
													variant="ghost"
													shape="square"
													size="sm"
													icon={<XIcon size={14} />}
													onClick={() => removeCondition(index)}
													aria-label="Remove condition"
												/>
											)}
										</div>
									))}
								</div>
								<Button
									variant="ghost"
									size="sm"
									icon={<PlusIcon size={14} />}
									onClick={addCondition}
									className="mt-2"
								>
									Add condition
								</Button>
							</div>
						) : (
							<div>
								<div className="text-sm font-medium text-kumo-default mb-2">Agent Prompt</div>
								<p className="text-xs text-kumo-subtle mb-2">
									Describe what emails should match this rule. The AI will evaluate every incoming email against this prompt.
								</p>
								<textarea
									value={ruleAgentPrompt}
									onChange={(e) => setRuleAgentPrompt(e.target.value)}
									placeholder="e.g. This email is from my kids' kindergarten and contains scheduling information."
									rows={3}
									className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring"
									required
								/>
							</div>
						)}

						<div>
							<div className="text-sm font-medium text-kumo-default mb-2">Action</div>
							<div className="flex items-center gap-2">
								<Select
									value={ruleActionType}
									onValueChange={(v) => setRuleActionType(v ?? "")}
								>
									<Select.Option value="add_label">Add label</Select.Option>
									<Select.Option value="save_attachment">Save attachments to Drive</Select.Option>
									<Select.Option value="send_notification">Send Pushover notification</Select.Option>
								</Select>
								{ruleActionType === "add_label" && (
									<Select
										value={ruleActionLabelId}
										onValueChange={(v) => setRuleActionLabelId(v ?? "")}
									>
										<Select.Option value="">Select label...</Select.Option>
										{labels.map((label) => (
											<Select.Option key={label.id} value={label.id}>
												{label.name}
											</Select.Option>
										))}
									</Select>
								)}
							</div>
							{ruleActionType === "send_notification" && (
								<div className="mt-2 space-y-2">
									<Input
										label="Notification title (optional)"
										placeholder="Defaults to email subject"
										value={ruleActionPushoverTitle}
										onChange={(e) => setRuleActionPushoverTitle(e.target.value)}
									/>
									<Input
										label="Notification message (optional)"
										placeholder="Defaults to sender info"
										value={ruleActionPushoverMessage}
										onChange={(e) => setRuleActionPushoverMessage(e.target.value)}
									/>
								</div>
							)}
						</div>

						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close
								render={(props) => (
									<Button {...props} variant="secondary" size="sm">
										Cancel
									</Button>
								)}
							/>
							<Button type="submit" variant="primary" size="sm" loading={isSavingRule}>
								{editingRuleId ? "Update" : "Create"}
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
