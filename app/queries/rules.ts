// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { Rule } from "~/types";
import { queryKeys } from "./keys";

export function useRules(mailboxId: string | undefined) {
	return useQuery<Rule[]>({
		queryKey: mailboxId ? queryKeys.rules.list(mailboxId) : ["rules", "_disabled"],
		queryFn: () => api.listRules(mailboxId!),
		enabled: !!mailboxId,
	});
}

export function useCreateRule() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			mailboxId,
			rule,
		}: {
			mailboxId: string;
			rule: {
				name: string;
				enabled?: boolean;
				match_all?: boolean;
				conditions: Array<{ field: string; operator: string; value: string }>;
				action_type: string;
				action_params: Record<string, unknown>;
			};
		}) => api.createRule(mailboxId, rule),
		onSuccess: (_data, { mailboxId }) => {
			qc.invalidateQueries({ queryKey: queryKeys.rules.list(mailboxId) });
		},
	});
}

export function useUpdateRule() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			mailboxId,
			id,
			updates,
		}: {
			mailboxId: string;
			id: string;
			updates: Partial<{
				name: string;
				enabled: boolean;
				match_all: boolean;
				conditions: Array<{ field: string; operator: string; value: string }>;
				action_type: string;
				action_params: Record<string, unknown>;
			}>;
		}) => api.updateRule(mailboxId, id, updates),
		onSuccess: (_data, { mailboxId }) => {
			qc.invalidateQueries({ queryKey: queryKeys.rules.list(mailboxId) });
		},
	});
}

export function useDeleteRule() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ mailboxId, id }: { mailboxId: string; id: string }) =>
			api.deleteRule(mailboxId, id),
		onSuccess: (_data, { mailboxId }) => {
			qc.invalidateQueries({ queryKey: queryKeys.rules.list(mailboxId) });
		},
	});
}
