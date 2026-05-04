// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Env } from "../types";

/**
 * The shape of an email as stored in SQLite.
 * Mirrors the fields used by applyRules and the emails table schema.
 */
export type EmailRecord = {
	id: string;
	subject: string;
	sender: string;
	recipient: string;
	cc?: string | null;
	bcc?: string | null;
	date: string;
	body: string;
	folder_id?: string;
	in_reply_to?: string | null;
	email_references?: string | null;
	thread_id?: string | null;
	message_id?: string | null;
	raw_headers?: string | null;
	read: boolean;
	starred: boolean;
};

/**
 * Context passed through the entire orchestrator pipeline.
 */
export type OrchestratorContext = {
	mailboxId: string;
	email: EmailRecord;
	mailboxSettings: Record<string, unknown>;
	env: Env;
};

/**
 * Build an OrchestratorContext by fetching mailbox settings from R2.
 */
export async function buildContext(
	mailboxId: string,
	email: EmailRecord,
	env: Env,
): Promise<OrchestratorContext> {
	let mailboxSettings: Record<string, unknown> = {};
	try {
		const obj = await env.BUCKET.head(`mailboxes/${mailboxId}.json`);
		if (obj) {
			const settingsObj = await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
			if (settingsObj) {
				mailboxSettings = (await settingsObj.json()) as Record<string, unknown>;
			}
		}
	} catch {
		// Fall through to empty settings
	}
	return {
		mailboxId,
		email,
		mailboxSettings,
		env,
	};
}
