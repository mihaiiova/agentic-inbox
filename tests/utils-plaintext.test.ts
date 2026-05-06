// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect } from "vitest";
import { isHtml, formatPlainText } from "../app/lib/utils";

describe("isHtml", () => {
	it("returns true for strings containing HTML tags", () => {
		expect(isHtml("<div>hello</div>")).toBe(true);
		expect(isHtml("<p>hello</p>")).toBe(true);
		expect(isHtml("<br>")).toBe(true);
		expect(isHtml("<a href='http://example.com'>link</a>")).toBe(true);
		expect(isHtml("<table><tr><td>cell</td></tr></table>")).toBe(true);
	});

	it("returns false for plain text without HTML tags", () => {
		expect(isHtml("Hello world")).toBe(false);
		expect(isHtml("if (x < 5 && y > 3)")).toBe(false);
		expect(isHtml("5 < 10 > 2")).toBe(false);
		expect(isHtml("Visit http://example.com")).toBe(false);
		expect(isHtml("Email me at <test@example.com>")).toBe(false);
	});

	it("returns false for empty string", () => {
		expect(isHtml("")).toBe(false);
	});
});

describe("formatPlainText", () => {
	it("escapes HTML special characters", () => {
		const result = formatPlainText("<script>alert(1)</script>");
		expect(result).toContain("&lt;script&gt;");
		expect(result).not.toContain("<script>");
	});

	it("converts newlines to <br>", () => {
		const result = formatPlainText("line1\nline2\nline3");
		expect(result).toContain("line1<br>line2<br>line3");
	});

	it("wraps output in a pre-wrap div", () => {
		const result = formatPlainText("hello");
		expect(result).toMatch(/^<div style="white-space:pre-wrap">/);
		expect(result).toMatch(/<\/div>$/);
	});

	it("auto-links http URLs", () => {
		const result = formatPlainText("Visit http://example.com today");
		expect(result).toContain(
			'<a href="http://example.com" target="_blank" rel="noopener noreferrer">http://example.com</a>',
		);
	});

	it("auto-links https URLs", () => {
		const result = formatPlainText("Visit https://example.com today");
		expect(result).toContain(
			'<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>',
		);
	});

	it("auto-links www. URLs with https scheme", () => {
		const result = formatPlainText("Visit www.example.com today");
		expect(result).toContain(
			'<a href="https://www.example.com" target="_blank" rel="noopener noreferrer">www.example.com</a>',
		);
	});

	it("auto-links email addresses with mailto", () => {
		const result = formatPlainText("Contact support@example.com");
		expect(result).toContain('<a href="mailto:support@example.com">support@example.com</a>');
	});

	it("strips trailing punctuation from URLs", () => {
		const result = formatPlainText("See https://example.com.");
		expect(result).toContain(
			'<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>.',
		);
	});

	it("handles a realistic plain-text email body", () => {
		const body =
			"mihai@datma.io has requested to automatically forward mail.\n" +
			"To allow this, please click the link below to confirm the request:\n" +
			"https://mail-settings.google.com/mail/vf-XXXX\n" +
			"If you click the link and it appears to be broken, please copy and paste it into a new browser window.\n" +
			"Thanks for using dhatma.com!";

		const result = formatPlainText(body);
		expect(result).toContain("<br>");
		expect(result).toContain(
			'<a href="https://mail-settings.google.com/mail/vf-XXXX"',
		);
		expect(result).toContain('<a href="mailto:mihai@datma.io">mihai@datma.io</a>');
		expect(result).not.toContain("<script>");
	});

	it("returns empty string for empty input", () => {
		expect(formatPlainText("")).toBe("");
	});
});
