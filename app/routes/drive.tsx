// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useState } from "react";
import { useParams } from "react-router";
import { HardDrive, Trash, Download } from "@phosphor-icons/react";
import { useDriveFiles, useDeleteDriveFile } from "~/queries/drive";
import api from "~/services/api";

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DrivePage() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const [page, setPage] = useState(1);
	const limit = 25;
	const { data, isLoading } = useDriveFiles(mailboxId, page, limit);
	const deleteFile = useDeleteDriveFile();
	const files = data?.files ?? [];
	const totalCount = data?.totalCount ?? 0;

	const handleDownload = async (fileId: string, filename: string) => {
		if (!mailboxId) return;
		const blob = await api.downloadDriveFile(mailboxId, fileId);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleDelete = async (fileId: string) => {
		if (!mailboxId) return;
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
				<HardDrive size={48} className="text-kumo-line mb-4" />
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
		<div className="flex-1 p-6 overflow-auto">
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-xl font-semibold text-kumo-default">Drive</h1>
				<span className="text-sm text-kumo-subtle">
					{totalCount} file{totalCount !== 1 ? "s" : ""}
				</span>
			</div>

			<div className="space-y-2">
				{files.map((file) => (
					<div
						key={file.id}
						className="flex items-center gap-4 p-3 rounded-lg border border-kumo-line bg-kumo-base hover:bg-kumo-tint transition-colors"
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
								<Download size={16} />
							</button>
							<button
								type="button"
								onClick={() => handleDelete(file.id)}
								className="p-2 rounded-md hover:bg-kumo-recessed text-kumo-subtle hover:text-kumo-danger transition-colors cursor-pointer"
								aria-label="Delete"
							>
								<Trash size={16} />
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
