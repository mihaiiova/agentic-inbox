// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	Badge,
	Button,
	Input,
	Pagination,
	Select,
	Tooltip,
} from "@cloudflare/kumo";
import {
	ArchiveIcon,
	ArrowBendUpLeftIcon,
	ArrowsClockwiseIcon,
	Download as DownloadIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	FileIcon,
	HardDrivesIcon,
	MagnifyingGlassIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	StarIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Folders } from "shared/folders";
import { formatListDate } from "shared/dates";
import { getSnippetText } from "~/lib/utils";
import {
	useDeleteEmail,
	useEmails,
	useMarkThreadRead,
	useUpdateEmail,
} from "~/queries/emails";
import { useDriveFiles, useDeleteDriveFile } from "~/queries/drive";
import { useFolders } from "~/queries/folders";
import { queryKeys } from "~/queries/keys";
import { useMailbox } from "~/queries/mailboxes";
import api from "~/services/api";
import type { Email } from "~/types";

const PAGE_SIZE = 25;

const FOLDER_EMPTY_STATES: Record<
	string,
	{
		icon: React.ReactNode;
		title: string;
		description: string;
		showCompose?: boolean;
	}
> = {
	[Folders.INBOX]: {
		icon: <TrayIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Your inbox is empty",
		description:
			"New emails will appear here when they arrive. Send an email to get the conversation started.",
		showCompose: true,
	},
	[Folders.SENT]: {
		icon: (
			<PaperPlaneTiltIcon size={48} weight="thin" className="text-kumo-subtle" />
		),
		title: "No sent emails",
		description: "Emails you send will show up here.",
		showCompose: true,
	},
	[Folders.DRAFT]: {
		icon: <FileIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "No drafts",
		description: "Emails you're still working on will be saved here.",
		showCompose: true,
	},
	[Folders.ARCHIVE]: {
		icon: <ArchiveIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Archive is empty",
		description:
			"Move emails here to keep your inbox clean without deleting them.",
	},
	[Folders.TRASH]: {
		icon: <TrashIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Trash is empty",
		description:
			"Deleted emails will appear here. You can restore them or permanently delete them.",
	},
};

function EmailListSkeleton() {
	return (
		<div className="animate-pulse space-y-1 p-2">
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 px-3 py-3">
					<div className="w-4 h-4 rounded bg-kumo-fill" />
					<div className="w-5 h-5 rounded bg-kumo-fill" />
					<div className="flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="h-3 w-24 rounded bg-kumo-fill" />
							<div className="h-3 w-4 rounded bg-kumo-fill" />
							<div className="h-3 flex-1 rounded bg-kumo-fill" />
							<div className="h-3 w-12 rounded bg-kumo-fill" />
						</div>
						<div className="h-2.5 w-3/4 rounded bg-kumo-fill" />
					</div>
				</div>
			))}
		</div>
	);
}

function FolderEmptyState({
	folder,
	onCompose,
}: {
	folder?: string;
	onCompose: () => void;
}) {
	const config = (folder && FOLDER_EMPTY_STATES[folder]) || {
		icon: (
			<EnvelopeSimpleIcon size={48} weight="thin" className="text-kumo-subtle" />
		),
		title: "No emails",
		description: "This folder is empty.",
	};

	return (
		<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
			<div className="mb-4">{config.icon}</div>
			<h3 className="text-base font-semibold text-kumo-default mb-1.5">
				{config.title}
			</h3>
			<p className="text-sm text-kumo-subtle max-w-xs mb-5">
				{config.description}
			</p>
			{"showCompose" in config && config.showCompose && (
				<Button
					variant="primary"
					size="sm"
					icon={<PencilSimpleIcon size={16} />}
					onClick={onCompose}
				>
					Compose
				</Button>
			)}
		</div>
	);
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function DriveView({ mailboxId }: { mailboxId: string }) {
	const [page, setPage] = useState(1);
	const limit = 25;
	const { data, isLoading } = useDriveFiles(mailboxId, page, limit);
	const deleteFile = useDeleteDriveFile();
	const files = data?.files ?? [];
	const totalCount = data?.totalCount ?? 0;

	const handleDownload = async (fileId: string, filename: string) => {
		const blob = await api.downloadDriveFile(mailboxId, fileId);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleDelete = async (fileId: string) => {
		await deleteFile.mutateAsync({ mailboxId, fileId });
	};

	if (isLoading) {
		return (
			<div className="flex-1 p-6">
				<div className="text-kumo-subtle">Loading...</div>
			</div>
		);
	}

	if (files.length === 0) {
		return (
			<div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
				<HardDrivesIcon size={48} className="text-kumo-line mb-4" />
				<h2 className="text-lg font-semibold text-kumo-default mb-1">
					No files in Drive yet
				</h2>
				<p className="text-kumo-subtle text-sm max-w-sm">
					Create a rule to automatically save attachments from incoming emails.
				</p>
			</div>
		);
	}

	const totalPages = Math.ceil(totalCount / limit);

	return (
		<div className="flex-1 p-4 md:p-6">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-base font-semibold text-kumo-default">Drive</h2>
				<span className="text-sm text-kumo-subtle">
					{totalCount} file{totalCount !== 1 ? "s" : ""}
				</span>
			</div>

			<div className="space-y-2">
				{files.map((file) => (
					<div
						key={file.id}
						className="flex items-center gap-3 p-3 rounded-lg border border-kumo-line bg-kumo-base hover:bg-kumo-tint transition-colors"
					>
						<div className="flex-1 min-w-0">
							<button
								type="button"
								onClick={() => handleDownload(file.id, file.filename)}
								className="text-sm font-medium text-kumo-default hover:text-kumo-brand truncate block text-left cursor-pointer bg-transparent border-0 p-0"
							>
								{file.filename}
							</button>
							<div className="flex items-center gap-2 mt-1 text-xs text-kumo-subtle">
								<span className="px-1.5 py-0.5 rounded bg-kumo-recessed">
									{file.mimetype.split("/")[1]?.toUpperCase() || file.mimetype}
								</span>
								<span>{formatBytes(file.size)}</span>
								<span>·</span>
								<span>{new Date(file.created_at).toLocaleDateString()}</span>
							</div>
						</div>
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => handleDownload(file.id, file.filename)}
								className="p-2 rounded-md hover:bg-kumo-recessed text-kumo-subtle hover:text-kumo-default transition-colors cursor-pointer"
								aria-label="Download"
							>
								<DownloadIcon size={16} />
							</button>
							<button
								type="button"
								onClick={() => handleDelete(file.id)}
								className="p-2 rounded-md hover:bg-kumo-recessed text-kumo-subtle hover:text-kumo-danger transition-colors cursor-pointer"
								aria-label="Delete"
							>
								<TrashIcon size={16} />
							</button>
						</div>
					</div>
				))}
			</div>

			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2 mt-6">
					<button
						type="button"
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
						className="px-3 py-1.5 text-sm rounded-md border border-kumo-line disabled:opacity-40 cursor-pointer"
					>
						Previous
					</button>
					<span className="text-sm text-kumo-subtle">
						Page {page} of {totalPages}
					</span>
					<button
						type="button"
						disabled={page >= totalPages}
						onClick={() => setPage((p) => p + 1)}
						className="px-3 py-1.5 text-sm rounded-md border border-kumo-line disabled:opacity-40 cursor-pointer"
					>
						Next
					</button>
				</div>
			)}
		</div>
	);
}

export default function InboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams, setSearchParams] = useSearchParams();
	const { data: currentMailbox } = useMailbox(mailboxId);

	// Determine if we're in drive mode
	const isDrive = searchParams.get("view") === "drive";

	// Current folder for email list (from query param)
	const currentFolder = isDrive ? "" : searchParams.get("folder") || Folders.INBOX;

	// Search state
	const [searchQuery, setSearchQuery] = useState("");

	// Email list state
	const [page, setPage] = useState(1);
	const queryClient = useQueryClient();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();

	const params = useMemo(
		() => ({
			folder: currentFolder,
			page: String(page),
			limit: String(PAGE_SIZE),
		}),
		[currentFolder, page],
	);

	const {
		data: emailData,
		isFetching: isRefreshing,
	} = useEmails(mailboxId, params, { refetchInterval: 30_000 });

	const emails = emailData?.emails ?? [];
	const totalCount = emailData?.totalCount ?? 0;

	const { data: folders = [] } = useFolders(mailboxId);

	const folderName = useMemo(() => {
		if (isDrive) return "Drive";
		const found = folders.find((f) => f.id === currentFolder);
		if (found) return found.name;
		return currentFolder
			? currentFolder.charAt(0).toUpperCase() + currentFolder.slice(1)
			: "Inbox";
	}, [folders, currentFolder, isDrive]);

	// Reset page when folder changes
	const prevFolderRef = useRef<string>("");
	useEffect(() => {
		const folderKey = `${mailboxId}/${currentFolder}`;
		if (prevFolderRef.current !== folderKey) {
			setPage(1);
		}
		prevFolderRef.current = folderKey;
	}, [mailboxId, currentFolder]);

	const handleSearch = () => {
		if (mailboxId && searchQuery.trim()) {
			navigate(`/mailbox/${mailboxId}/search?q=${encodeURIComponent(searchQuery.trim())}`);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleSearch();
	};

	const handleFolderChange = (value: string) => {
		if (!mailboxId) return;
		if (value === "__drive__") {
			setSearchParams({ view: "drive" });
		} else {
			setSearchParams({ folder: value });
		}
	};

	const handleRefresh = () => {
		if (mailboxId) {
			queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
			queryClient.invalidateQueries({
				queryKey: queryKeys.folders.list(mailboxId),
			});
		}
	};

	const handleRowClick = (email: Email) => {
		if (mailboxId) {
			navigate(`/mailbox/${mailboxId}/email/${email.id}`);
			if (!email.read) {
				if (email.thread_id && email.thread_count && email.thread_count > 1) {
					markThreadRead.mutate({ mailboxId, threadId: email.thread_id });
				} else {
					updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
				}
			}
		}
	};

	const toggleStar = (e: React.MouseEvent, email: Email) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId)
			updateEmail.mutate({
				mailboxId,
				id: email.id,
				data: { starred: !email.starred },
			});
	};

	const handleDelete = (e: React.MouseEvent, emailId: string) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId) {
			const confirmed = window.confirm("Are you sure you want to delete this email?");
			if (!confirmed) return;
			deleteEmail.mutate({ mailboxId, id: emailId });
		}
	};

	const hasUnread = (email: Email): boolean => {
		if (email.thread_unread_count !== undefined) {
			return email.thread_unread_count > 0;
		}
		return !email.read;
	};

	const formatParticipants = (email: Email): string => {
		if (email.participants) {
			const names = email.participants
				.split(",")
				.map((p) => p.trim().split("@")[0])
				.filter((name, idx, arr) => arr.indexOf(name) === idx);
			if (names.length <= 3) return names.join(", ");
			return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
		}
		return email.sender.split("@")[0];
	};

	// Build folder select options
	const folderOptions = useMemo(() => {
		const system = [
			{ value: Folders.INBOX, label: "Inbox", icon: <TrayIcon size={14} /> },
			{ value: "__drive__", label: "Drive", icon: <HardDrivesIcon size={14} /> },
			{ value: Folders.SENT, label: "Sent", icon: <PaperPlaneTiltIcon size={14} /> },
			{ value: Folders.DRAFT, label: "Drafts", icon: <FileIcon size={14} /> },
			{ value: Folders.ARCHIVE, label: "Archive", icon: <ArchiveIcon size={14} /> },
			{ value: Folders.TRASH, label: "Trash", icon: <TrashIcon size={14} /> },
		];
		const custom = folders
			.filter((f) => ![Folders.INBOX, Folders.SENT, Folders.DRAFT, Folders.ARCHIVE, Folders.TRASH].includes(f.id))
			.map((f) => ({ value: f.id, label: f.name, icon: null }));
		return [...system, ...custom];
	}, [folders]);

	const selectValue = isDrive ? "__drive__" : currentFolder;

	return (
		<div className="flex flex-col min-h-full">
			{/* Search + Folder bar */}
			<div className="sticky top-0 bg-kumo-base border-b border-kumo-line px-4 py-3 space-y-2.5">
				{/* Identity row — mobile only */}
				<div className="flex md:hidden items-center justify-between">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-kumo-default truncate">
							{currentMailbox?.settings?.fromName || currentMailbox?.name || mailboxId?.split("@")[0]}
						</div>
						<div className="text-xs text-kumo-subtle truncate">
							{currentMailbox?.email || mailboxId}
						</div>
					</div>
				</div>

				{/* Search + Refresh + Folder row */}
				<div className="flex items-center gap-2">
				<Select
					value={selectValue}
					onValueChange={handleFolderChange}
					renderValue={(value) => {
						const opt = folderOptions.find((o) => o.value === (value as string));
						return opt ? opt.label : String(value);
					}}
				>
					{folderOptions.map((opt) => (
						<Select.Option key={opt.value} value={opt.value}>
							<div className="flex items-center gap-2">
								{opt.icon}
								<span>{opt.label}</span>
							</div>
						</Select.Option>
					))}
				</Select>
					<Input
						className="flex-1 min-w-0"
						placeholder="Search emails..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={handleKeyDown}
					/>
					<Button
						variant="ghost"
						shape="square"
						size="sm"
						icon={<MagnifyingGlassIcon size={16} />}
						onClick={handleSearch}
						aria-label="Search"
					/>
					<Tooltip content={isRefreshing ? "Refreshing..." : "Refresh"} side="bottom" asChild>
						<Button
							variant="ghost"
							shape="square"
							size="sm"
							icon={
								<ArrowsClockwiseIcon
									size={16}
									className={isRefreshing ? "animate-spin" : ""}
								/>
							}
							onClick={handleRefresh}
							disabled={isRefreshing}
							aria-label="Refresh"
						/>
					</Tooltip>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1">
				{isDrive ? (
					<DriveView mailboxId={mailboxId!} />
				) : (
					<>
						{/* Folder header */}
						<div className="flex items-center justify-between px-4 py-2 border-b border-kumo-line">
							<h1 className="text-sm font-semibold text-kumo-default">
								{folderName}
							</h1>
							{totalCount > 0 && (
								<span className="text-xs text-kumo-subtle">
									{totalCount} conversation{totalCount !== 1 ? "s" : ""}
								</span>
							)}
						</div>

						{/* Email rows */}
						<div>
							{isRefreshing && emails.length === 0 ? (
								<EmailListSkeleton />
							) : emails.length > 0 ? (
								<div>
									{emails.map((email) => {
										const snippet = getSnippetText(email.snippet);
										return (
											<div
												key={email.id}
												role="button"
												tabIndex={0}
												onClick={() => handleRowClick(email)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														handleRowClick(email);
													}
												}}
												className="group flex items-center gap-3 w-full text-left cursor-pointer transition-colors border-b border-kumo-line px-4 py-2.5 hover:bg-kumo-tint"
											>
												{/* Unread dot */}
												<div className="w-2.5 shrink-0 flex justify-center">
													{hasUnread(email) && (
														<div className="h-2 w-2 rounded-full bg-kumo-brand" />
													)}
												</div>

												{/* Star */}
												<button
													type="button"
													className="shrink-0 p-0.5 bg-transparent border-0 cursor-pointer"
													onClick={(e) => toggleStar(e, email)}
												>
													<StarIcon
														size={14}
														weight={email.starred ? "fill" : "regular"}
														className={
															email.starred
																? "text-kumo-warning"
																: "text-kumo-subtle hover:text-kumo-warning"
														}
													/>
												</button>

												{/* Content */}
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-2">
														<span
															className={`truncate text-sm ${hasUnread(email) ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}
														>
															{formatParticipants(email)}
														</span>
														{(email.thread_count ?? 1) > 1 && (
															<span className="shrink-0 text-xs text-kumo-subtle bg-kumo-fill rounded-full px-1.5 py-0.5 font-medium">
																{email.thread_count}
															</span>
														)}
														{email.has_draft && (
															<span className="shrink-0 text-xs text-kumo-destructive font-medium">
																Draft
															</span>
														)}
														{email.needs_reply && !email.has_draft && (
																<Tooltip content="Needs reply" asChild>
																	<span className="shrink-0 text-kumo-warning">
																		<ArrowBendUpLeftIcon size={12} weight="bold" />
																	</span>
																</Tooltip>
														)}
														<span className="text-xs text-kumo-subtle shrink-0 ml-auto">
															{formatListDate(email.date)}
														</span>
													</div>
													<div className="truncate text-sm mt-0.5">
														<span
															className={hasUnread(email) ? "font-medium text-kumo-default" : "text-kumo-subtle"}
														>
															{email.subject}
														</span>
														{snippet && (
															<span className="text-kumo-subtle font-normal">
																{" "}&mdash; {snippet}
															</span>
														)}
														{email.labels && email.labels.length > 0 && (
																<span className="ml-1.5 inline-flex gap-1">
																	{email.labels.map((label) => (
																		<Badge key={label.id} variant={label.color as any}>
																			{label.name}
																		</Badge>
																	))}
																</span>
															)}
													</div>
												</div>

												{/* Hover actions */}
												<div className="hidden group-hover:flex items-center shrink-0">
													<Tooltip content={email.read ? "Mark unread" : "Mark read"} asChild>
														<Button
															variant="ghost"
															shape="square"
															size="sm"
															icon={email.read ? <EnvelopeSimpleIcon size={12} /> : <EnvelopeOpenIcon size={12} />}
															onClick={(e) => {
																e.stopPropagation();
																if (mailboxId)
																	updateEmail.mutate({
																		mailboxId,
																		id: email.id,
																		data: { read: !email.read },
																	});
															}}
															aria-label={email.read ? "Mark unread" : "Mark read"}
														/>
													</Tooltip>
													<Tooltip content="Delete" asChild>
														<Button
															variant="ghost"
															shape="square"
															size="sm"
															icon={<TrashIcon size={12} />}
															onClick={(e) => handleDelete(e, email.id)}
															aria-label="Delete"
														/>
													</Tooltip>
												</div>
											</div>
										);
									})}
								</div>
							) : (
								<FolderEmptyState
									folder={currentFolder}
									onCompose={() => {
										if (mailboxId) navigate(`/mailbox/${mailboxId}/compose`);
									}}
								/>
							)}
						</div>

						{/* Pagination */}
						{totalCount > PAGE_SIZE && (
							<div className="flex justify-center py-3 border-t border-kumo-line">
								<Pagination
									page={page}
									setPage={setPage}
									perPage={PAGE_SIZE}
									totalCount={totalCount}
								/>
							</div>
						)}
					</>
				)}
			</div>

			{/* Compose FAB */}
			<div className="sticky bottom-0 flex justify-end p-4 pointer-events-none">
				<Button
					variant="primary"
					shape="circle"
					size="lg"
					icon={<PencilSimpleIcon size={20} />}
					onClick={() => {
						if (mailboxId) navigate(`/mailbox/${mailboxId}/compose`);
					}}
					className="pointer-events-auto shadow-lg"
					aria-label="Compose email"
				/>
			</div>
		</div>
	);
}
