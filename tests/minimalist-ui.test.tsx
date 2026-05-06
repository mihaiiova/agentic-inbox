// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import TabBar from "../app/components/TabBar";

// Mock Kumo components that might not work in test environment
vi.mock("@cloudflare/kumo", async () => {
	const actual = await vi.importActual("@cloudflare/kumo");
	return {
		...actual,
		// Keep actual implementations where possible
	};
});

describe("TabBar", () => {
	function renderWithRouter(initialRoute = "/mailbox/test@example.com/inbox") {
		return render(
			<MemoryRouter initialEntries={[initialRoute]}>
				<Routes>
					<Route path="mailbox/:mailboxId/*" element={<TabBar />} />
				</Routes>
			</MemoryRouter>
		);
	}

	it("renders three tabs", () => {
		renderWithRouter();
		expect(screen.getByText("Inbox")).toBeInTheDocument();
		expect(screen.getByText("Agent")).toBeInTheDocument();
		expect(screen.getByText("Settings")).toBeInTheDocument();
	});

	it("highlights the active tab", () => {
		renderWithRouter("/mailbox/test@example.com/inbox");
		const inboxTab = screen.getByText("Inbox").closest("a");
		expect(inboxTab).toHaveClass("border-kumo-brand");
		expect(inboxTab).toHaveClass("text-kumo-brand");
	});

	it("links to correct routes", () => {
		renderWithRouter();
		expect(screen.getByText("Inbox").closest("a")).toHaveAttribute(
			"href",
			"/mailbox/test@example.com/inbox"
		);
		expect(screen.getByText("Agent").closest("a")).toHaveAttribute(
			"href",
			"/mailbox/test@example.com/agent"
		);
		expect(screen.getByText("Settings").closest("a")).toHaveAttribute(
			"href",
			"/mailbox/test@example.com/settings"
		);
	});
});
