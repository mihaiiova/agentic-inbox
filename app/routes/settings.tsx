// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon, PlusIcon, TagIcon, TrashIcon, FadersIcon, PencilSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { useLabels, useCreateLabel, useDeleteLabel } from "~/queries/labels";
import { useRules, useCreateRule, useUpdateRule, useDeleteRule } from "~/queries/rules";
import type { RuleCondition } from "~/types";

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
	const [ruleEnabled, setRuleEnabled] = useState(true);
	const [ruleMatchAll, setRuleMatchAll] = useState(true);
	const [ruleConditions, setRuleConditions] = useState<RuleCondition[]>([
		{ field: "from", operator: "contains", value: "" },
	]);
	const [ruleActionType, setRuleActionType] = useState("add_label");
	const [ruleActionLabelId, setRuleActionLabelId] = useState("");
	const [isSavingRule, setIsSavingRule] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
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
		setRuleEnabled(true);
		setRuleMatchAll(true);
		setRuleConditions([{ field: "from", operator: "contains", value: "" }]);
		setRuleActionType("add_label");
		setRuleActionLabelId("");
	};

	const openEditRule = (rule: import("~/types").Rule) => {
		setEditingRuleId(rule.id);
		setRuleName(rule.name);
		setRuleEnabled(!!rule.enabled);
		setRuleMatchAll(!!rule.match_all);
		try {
			setRuleConditions(JSON.parse(rule.conditions) as RuleCondition[]);
		} catch {
			setRuleConditions([]);
		}
		setRuleActionType(rule.action_type);
		try {
			const params = JSON.parse(rule.action_params) as Record<string, unknown>;
			setRuleActionLabelId((params.label_id as string) || "");
		} catch {
			setRuleActionLabelId("");
		}
		setIsRuleDialogOpen(true);
	};

	const handleSaveRule = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!mailboxId || !ruleName.trim()) return;
		if (ruleConditions.some((c) => !c.value.trim())) {
			toastManager.add({ title: "All conditions must have a value", variant: "error" });
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
			if (editingRuleId) {
				await updateRuleMutation.mutateAsync({
					mailboxId,
					id: editingRuleId,
					updates: {
						name: ruleName.trim(),
						enabled: ruleEnabled,
						match_all: ruleMatchAll,
						conditions: ruleConditions,
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
						enabled: ruleEnabled,
						match_all: ruleMatchAll,
						conditions: ruleConditions,
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
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
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
										.map((c) => `${c.field} ${c.operator} "${c.value}"`)
										.join(rule.match_all ? " AND " : " OR ");
								} catch {
									conditionsText = "Invalid conditions";
								}
								try {
									const params = JSON.parse(rule.action_params) as Record<string, unknown>;
									if (rule.action_type === "add_label") {
										const label = labels.find((l) => l.id === params.label_id);
										actionText = label
											? `Add label "${label.name}"`
											: "Add label (deleted)";
									} else {
										actionText = rule.action_type;
									}
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
											<div className="text-sm font-medium text-kumo-default">
												{rule.name}
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
							<label className="flex items-center gap-2 text-sm text-kumo-default cursor-pointer">
								<input
									type="checkbox"
									checked={ruleMatchAll}
									onChange={(e) => setRuleMatchAll(e.target.checked)}
									className="rounded border-kumo-line"
								/>
								Match all conditions
							</label>
						</div>

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
											placeholder="Value"
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

						<div>
							<div className="text-sm font-medium text-kumo-default mb-2">Action</div>
							<div className="flex items-center gap-2">
								<Select
									value={ruleActionType}
									onValueChange={(v) => setRuleActionType(v)}
								>
									<Select.Option value="add_label">Add label</Select.Option>
								</Select>
								{ruleActionType === "add_label" && (
									<Select
										value={ruleActionLabelId}
										onValueChange={(v) => setRuleActionLabelId(v)}
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
