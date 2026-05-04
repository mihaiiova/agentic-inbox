// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { DriveFile } from "~/types";
import { queryKeys } from "./keys";

export function useDriveFiles(
	mailboxId: string | undefined,
	page: number = 1,
	limit: number = 25,
) {
	return useQuery<{ files: DriveFile[]; totalCount: number }>({
		queryKey: mailboxId
			? queryKeys.drive.list(mailboxId, page, limit)
			: ["drive", "_disabled"],
		queryFn: () =>
			api.listDriveFiles(mailboxId!, {
				page: String(page),
				limit: String(limit),
			}),
		enabled: !!mailboxId,
	});
}

export function useDeleteDriveFile() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			mailboxId,
			fileId,
		}: {
			mailboxId: string;
			fileId: string;
		}) => api.deleteDriveFile(mailboxId, fileId),
		onSuccess: (_data, { mailboxId }) => {
			qc.invalidateQueries({ queryKey: ["drive", mailboxId] });
		},
	});
}
