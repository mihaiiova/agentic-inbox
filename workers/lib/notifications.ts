// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Pushover delivery for incoming mail notifications. */
import type { Env } from "../types";

interface PushoverPayload {
	token: string;
	user: string;
	title?: string;
	message: string;
	priority?: number;
	url?: string;
	url_title?: string;
}

interface NotificationEmail {
	subject: string;
	sender: string;
}

export async function sendPushoverNotification(
	env: Env,
	userKey: string,
	email: NotificationEmail,
	overrides?: {
		title?: string;
		message?: string;
		priority?: number;
		url?: string;
		url_title?: string;
	},
): Promise<{ success: boolean; error?: string }> {
	const appToken = env.PUSHOVER_APP_TOKEN;
	if (!appToken) return { success: false, error: "Pushover app token not configured" };
	if (!userKey) return { success: false, error: "Pushover user key not configured" };

	const priority = overrides?.priority ?? 0;
	const payload: PushoverPayload = {
		token: appToken,
		user: userKey,
		title: overrides?.title || email.subject || "New email",
		message: overrides?.message || `From: ${email.sender || "Unknown"}`,
	};
	if (priority !== 0) payload.priority = priority;
	if (overrides?.url) {
		payload.url = overrides.url;
		payload.url_title = overrides.url_title || "View email";
	}

	try {
		const response = await fetch("https://api.pushover.net/1/messages.json", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			return { success: false, error: `Pushover API error ${response.status}: ${await response.text()}` };
		}
		return { success: true };
	} catch (error) {
		return { success: false, error: `Pushover request failed: ${(error as Error).message}` };
	}
}

export async function getMailboxPushoverKey(
	env: Env,
	mailboxId: string,
): Promise<string | null> {
	try {
		const obj = await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
		if (!obj) return null;
		const settings = await obj.json<Record<string, unknown>>();
		if (typeof settings.pushoverUserKey === "string" && settings.pushoverUserKey.trim()) {
			return settings.pushoverUserKey.trim();
		}
	} catch {
		// Ignore malformed or missing mailbox settings.
	}
	return null;
}
