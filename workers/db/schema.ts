// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const folders = sqliteTable("folders", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	is_deletable: integer("is_deletable").notNull().default(1),
});

export const emails = sqliteTable("emails", {
	id: text("id").primaryKey(),
	folder_id: text("folder_id")
		.notNull()
		.references(() => folders.id, { onDelete: "cascade" }),
	subject: text("subject"),
	sender: text("sender"),
	recipient: text("recipient"),
	cc: text("cc"),
	bcc: text("bcc"),
	date: text("date"),
	read: integer("read").default(0),
	starred: integer("starred").default(0),
	body: text("body"),
	in_reply_to: text("in_reply_to"),
	email_references: text("email_references"),
	thread_id: text("thread_id"),
	message_id: text("message_id"),
	raw_headers: text("raw_headers"),
});

export const attachments = sqliteTable("attachments", {
	id: text("id").primaryKey(),
	email_id: text("email_id")
		.notNull()
		.references(() => emails.id, { onDelete: "cascade" }),
	filename: text("filename").notNull(),
	mimetype: text("mimetype").notNull(),
	size: integer("size").notNull(),
	content_id: text("content_id"),
	disposition: text("disposition"),
});

export const labels = sqliteTable("labels", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	color: text("color").notNull().default("primary"),
	created_at: text("created_at").notNull().default("datetime('now')"),
});

export const emailLabels = sqliteTable("email_labels", {
	email_id: text("email_id")
		.notNull()
		.references(() => emails.id, { onDelete: "cascade" }),
	label_id: text("label_id")
		.notNull()
		.references(() => labels.id, { onDelete: "cascade" }),
});

export const rules = sqliteTable("rules", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	type: text("type").notNull().default("static"),
	enabled: integer("enabled").notNull().default(1),
	match_all: integer("match_all").notNull().default(1),
	conditions: text("conditions").notNull(),
	agent_prompt: text("agent_prompt"),
	action_type: text("action_type").notNull(),
	action_params: text("action_params").notNull(),
	created_at: text("created_at").notNull().default("datetime('now')"),
});

export const ruleLogs = sqliteTable("rule_logs", {
	id: text("id").primaryKey(),
	email_id: text("email_id").notNull(),
	rule_id: text("rule_id"),
	rule_type: text("rule_type").notNull(),
	action_type: text("action_type").notNull(),
	status: text("status").notNull(),
	details: text("details").notNull(),
	created_at: text("created_at").notNull().default("datetime('now')"),
});

export const driveFiles = sqliteTable("drive_files", {
	id: text("id").primaryKey(),
	email_id: text("email_id").references(() => emails.id, { onDelete: "set null" }),
	filename: text("filename").notNull(),
	mimetype: text("mimetype").notNull(),
	size: integer("size").notNull(),
	r2_key: text("r2_key").notNull(),
	created_at: text("created_at").notNull().default("datetime('now')"),
});
