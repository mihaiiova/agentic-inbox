// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Notification delivery via Pushover.
 *
 * Sends mobile/push notifications for rule actions.
 */

import type { Env } from "../types";

interface PushoverPayload {
	token: string;
	user: string;
	title?: string;
	message: string;
	priority?: number;
}

interface NotificationEmail {
	subject: string;
	sender: string;
}

/**
 * Send a Pushover notification.
 *
 * @param env - Worker env (must contain PUSHOVER_APP_TOKEN)
 * @param userKey - Pushover user key
 * @param email - Email metadata for default message construction
 * @param overrides - Optional overrides for title, message, priority
 * @returns Success status and optional error message
 */
export async function sendPushoverNotification(
	env: Env,
	userKey: string,
	email: NotificationEmail,
	overrides?: {
		title?: string;
		message?: string;
		priority?: number;
	},
): Promise<{ success: boolean; error?: string }> {
	const appToken = env.PUSHOVER_APP_TOKEN;
	if (!appToken) {
		return { success: false, error: "Pushover app token not configured" };
	}
	if (!userKey) {
		return { success: false, error: "Pushover user key not configured" };
	}

	const title = overrides?.title || email.subject || "New email";
	const message = overrides?.message || `From: ${email.sender || "Unknown"}`;
	const priority = overrides?.priority ?? 0;

	const payload: PushoverPayload = {
		token: appToken,
		user: userKey,
		title,
		message,
	};

	if (priority !== 0) {
		payload.priority = priority;
	}

	try {
		const response = await fetch("https://api.pushover.net/1/messages.json", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const text = await response.text();
			return { success: false, error: `Pushover API error ${response.status}: ${text}` };
		}

		return { success: true };
	} catch (e) {
		return { success: false, error: `Pushover request failed: ${(e as Error).message}` };
	}
}

/**
 * Read mailbox settings from R2 to get the Pushover user key.
 */
export async function getMailboxPushoverKey(
	env: Env,
	mailboxId: string,
): Promise<string | null> {
	try {
		const key = `mailboxes/${mailboxId}.json`;
		const obj = await env.BUCKET.get(key);
		if (!obj) return null;
		const settings = await obj.json<Record<string, unknown>>();
		if (typeof settings.pushoverUserKey === "string" && settings.pushoverUserKey.trim()) {
			return settings.pushoverUserKey.trim();
		}
	} catch {
		// Fall through to null
	}
	return null;
}
