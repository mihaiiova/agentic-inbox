// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Minimal DurableObjectStorage mock backed by better-sqlite3.
 * Used for testing MailboxDO logic outside the Workers runtime.
 */
import Database from "better-sqlite3";

type SqlStorageValue = ArrayBuffer | string | number | null;

class MockSqlStorageCursor<T extends Record<string, SqlStorageValue>> {
	private rows: T[];
	private index = 0;
	columnNames: string[];
	rowsRead = 0;
	rowsWritten = 0;

	constructor(rows: T[], columnNames: string[]) {
		this.rows = rows;
		this.columnNames = columnNames;
		this.rowsRead = rows.length;
	}

	next():
		| { done?: false; value: T }
		| { done: true; value?: never } {
		if (this.index >= this.rows.length) {
			return { done: true };
		}
		return { done: false, value: this.rows[this.index++] };
	}

	toArray(): T[] {
		return this.rows;
	}

	one(): T {
		return this.rows[0];
	}

	raw<U extends SqlStorageValue[]>(): IterableIterator<U> {
		const iter = this.rows.map((row) =>
			this.columnNames.map((col) => row[col] as U[number]),
		) as U[];
		return iter[Symbol.iterator]();
	}

	[Symbol.iterator](): IterableIterator<T> {
		return this.rows[Symbol.iterator]();
	}
}

class MockSqlStorage {
	private db: Database.Database;
	Cursor = MockSqlStorageCursor;
	Statement = class {};

	constructor(db: Database.Database) {
		this.db = db;
	}

	exec<T extends Record<string, SqlStorageValue>>(
		query: string,
		...bindings: any[]
	): MockSqlStorageCursor<T> {
		// Normalize DO-style ?NNN placeholders to plain ? for better-sqlite3
		const normalizedQuery = query.replace(/\?\d+/g, "?");
		// Split multi-statement queries (migrations often have multiple CREATE/INSERT)
		const statements = normalizedQuery
			.split(/;\s*(?=\S)/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		let lastResult: { rows: T[]; columnNames: string[] } = { rows: [], columnNames: [] };

		for (const sql of statements) {
			const stmt = this.db.prepare(sql);
			if (stmt.reader) {
				lastResult = {
					rows: stmt.all(...bindings) as T[],
					columnNames: stmt.columns().map((c) => c.name),
				};
			} else {
				stmt.run(...bindings);
			}
		}

		return new MockSqlStorageCursor<T>(lastResult.rows, lastResult.columnNames);
	}

	get databaseSize(): number {
		return 0;
	}
}

export class MockDurableObjectStorage implements DurableObjectStorage {
	sql: MockSqlStorage;
	private db: Database.Database;

	constructor() {
		this.db = new Database(":memory:");
		this.sql = new MockSqlStorage(this.db);
	}

	async get<T = unknown>(
		key: string | string[],
		_options?: DurableObjectGetOptions,
	): Promise<T | undefined | Map<string, T>> {
		if (Array.isArray(key)) {
			const map = new Map<string, T>();
			for (const k of key) {
				const val = undefined;
				if (val !== undefined) map.set(k, val as T);
			}
			return map;
		}
		return undefined;
	}

	async list<T = unknown>(
		_options?: DurableObjectListOptions,
	): Promise<Map<string, T>> {
		return new Map();
	}

	async put<T>(
		_key: string | Record<string, T>,
		_value?: T,
		_options?: DurableObjectPutOptions,
	): Promise<void> {}

	async delete(
		_key: string | string[],
		_options?: DurableObjectPutOptions,
	): Promise<boolean | number> {
		return 0;
	}

	async deleteAll(_options?: DurableObjectPutOptions): Promise<void> {}

	async transaction<T>(
		closure: (txn: DurableObjectTransaction) => Promise<T>,
	): Promise<T> {
		return closure({} as DurableObjectTransaction);
	}

	async getAlarm(_options?: DurableObjectGetAlarmOptions): Promise<number | null> {
		return null;
	}

	async setAlarm(
		_scheduledTime: number | Date,
		_options?: DurableObjectSetAlarmOptions,
	): Promise<void> {}

	async deleteAlarm(_options?: DurableObjectSetAlarmOptions): Promise<void> {}

	async sync(): Promise<void> {}

	transactionSync<T>(closure: () => T): T {
		return closure();
	}

	async getCurrentBookmark(): Promise<string> {
		return "";
	}

	async getBookmarkForTime(_timestamp: number | Date): Promise<string> {
		return "";
	}

	async onNextSessionRestoreBookmark(_bookmark: string): Promise<string> {
		return "";
	}
}
