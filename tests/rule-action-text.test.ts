// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect } from "vitest";
import { getRuleActionText } from "../app/routes/settings";

describe("getRuleActionText", () => {
	it("returns label text for add_label action", () => {
		const result = getRuleActionText("add_label", { label_id: "l1" }, [
			{ id: "l1", name: "Important" },
		]);
		expect(result).toBe('Add label "Important"');
	});

	it("returns fallback for missing label", () => {
		const result = getRuleActionText("add_label", { label_id: "l2" }, [
			{ id: "l1", name: "Important" },
		]);
		expect(result).toBe("Add label (deleted)");
	});

	it("returns Drive text for save_attachment action", () => {
		const result = getRuleActionText("save_attachment", {}, []);
		expect(result).toBe("Save attachments to Drive");
	});

	it("returns raw action type for unknown actions", () => {
		const result = getRuleActionText("unknown_action", {}, []);
		expect(result).toBe("unknown_action");
	});
});
