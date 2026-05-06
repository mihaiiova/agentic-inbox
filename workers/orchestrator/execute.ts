// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { sendPushoverNotification, getMailboxPushoverKey } from "../lib/notifications";
import type { Plan, Action } from "./plan";
import type { OrchestratorContext } from "./context";

export type ActionResult = {
	action: Action;
	status: "success" | "failed";
	error?: string;
};

type ExecutorDeps = {
	db: {
		insert: (table: any) => { values: (vals: any) => { run: () => void } };
		select: (...args: any[]) => { from: (table: any) => { where: (cond: any) => { all: () => any[] } } };
	};
	env: OrchestratorContext["env"];
};

/**
 * Execute all actions in a plan sequentially.
 * If an action fails, execution stops and the error is captured.
 */
export async function executePlan(
	plan: Plan,
	ctx: OrchestratorContext,
	deps: ExecutorDeps,
): Promise<ActionResult[]> {
	const results: ActionResult[] = [];

	for (const action of plan.actions) {
		try {
			switch (action.type) {
				case "add_label":
					await executeAddLabel(action, ctx, deps);
					break;
				case "save_attachment":
					await executeSaveAttachment(action, ctx, deps);
					break;
				case "send_notification":
					await executeSendNotification(action, ctx, deps);
					break;
				default:
					throw new Error(`Unknown action type: ${(action as Action).type}`);
			}
			results.push({ action, status: "success" });
		} catch (e) {
			const error = (e as Error).message;
			results.push({ action, status: "failed", error });
			console.warn(`Action ${action.type} failed for email ${plan.emailId}:`, error);
			break; // Stop execution on first failure
		}
	}

	return results;
}

async function executeAddLabel(
	action: Extract<Action, { type: "add_label" }>,
	ctx: OrchestratorContext,
	deps: ExecutorDeps,
) {
	const { label_id } = action.params;
	if (!label_id) throw new Error("label_id is required");
	try {
		deps.db.insert(schema.emailLabels).values({
			email_id: ctx.email.id,
			label_id,
		}).run();
	} catch {
		// Unique constraint = label already applied, treat as success
	}
}

async function executeSaveAttachment(
	_action: Extract<Action, { type: "save_attachment" }>,
	ctx: OrchestratorContext,
	deps: ExecutorDeps,
) {
	console.log(`[executeSaveAttachment] emailId=${ctx.email.id}`);

	const attachments = deps.db
		.select()
		.from(schema.attachments)
		.where(eq(schema.attachments.email_id, ctx.email.id))
		.all();

	console.log(`[executeSaveAttachment] found ${attachments.length} attachments in DB`);

	if (attachments.length === 0) {
		console.warn("[executeSaveAttachment] no attachments found — nothing to save");
		return;
	}

	for (const att of attachments) {
		try {
			const sourceKey = `attachments/${ctx.email.id}/${att.id}/${att.filename}`;
			console.log(`[executeSaveAttachment] reading R2 key: ${sourceKey}`);
			const obj = await deps.env.BUCKET.get(sourceKey);
			if (!obj) {
				console.warn(`[executeSaveAttachment] R2 object not found: ${sourceKey}`);
				continue;
			}

			// Stream the body into a Uint8Array
			const chunks: Uint8Array[] = [];
			const reader = obj.body.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
			const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
			const blob = new Uint8Array(totalLength);
			let offset = 0;
			for (const chunk of chunks) {
				blob.set(chunk, offset);
				offset += chunk.length;
			}

			const driveFileId = crypto.randomUUID();
			const driveKey = `drive/${driveFileId}/${att.filename}`;
			console.log(`[executeSaveAttachment] writing R2 key: ${driveKey}`);
			await deps.env.BUCKET.put(driveKey, blob);

			// Insert drive file record
			console.log(`[executeSaveAttachment] inserting drive_files row: id=${driveFileId}`);
			deps.db.insert(schema.driveFiles).values({
				id: driveFileId,
				email_id: ctx.email.id,
				filename: att.filename,
				mimetype: att.mimetype,
				size: att.size,
				r2_key: driveKey,
			}).run();
			console.log(`[executeSaveAttachment] successfully saved attachment ${att.id} as drive file ${driveFileId}`);
		} catch (e) {
			console.warn(`[executeSaveAttachment] failed to save attachment ${att.id}:`, (e as Error).message);
			throw e;
		}
	}
}

async function executeSendNotification(
	action: Extract<Action, { type: "send_notification" }>,
	ctx: OrchestratorContext,
	deps: ExecutorDeps,
) {
	const userKey = (await getMailboxPushoverKey(deps.env, ctx.mailboxId)) || undefined;
	if (!userKey) {
		console.warn("Skipping notification: no Pushover user key configured");
		return;
	}

	const result = await sendPushoverNotification(
		deps.env,
		userKey,
		{ subject: ctx.email.subject || "(no subject)", sender: ctx.email.sender || "Unknown" },
		{
			title: action.params.title,
			message: action.params.message,
			priority: action.params.priority,
		},
	);

	if (!result.success) {
		throw new Error(result.error || "Pushover notification failed");
	}
}
