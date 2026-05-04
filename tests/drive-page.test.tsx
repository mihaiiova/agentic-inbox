// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import DrivePage from "../app/routes/drive";

vi.mock("../app/queries/drive", () => ({
	useDriveFiles: vi.fn(),
	useDeleteDriveFile: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

import { useDriveFiles } from "../app/queries/drive";

function renderWithProviders(ui: React.ReactNode) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={["/mailboxes/test@example.com/drive"]}>
				<Routes>
					<Route path="/mailboxes/:mailboxId/drive" element={ui} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("Drive page", () => {
	it("renders empty state when no files", () => {
		vi.mocked(useDriveFiles).mockReturnValue({
			data: { files: [], totalCount: 0 },
			isLoading: false,
		} as any);

		renderWithProviders(<DrivePage />);
		expect(screen.getByText(/No files in Drive yet/i)).toBeInTheDocument();
	});

	it("renders drive files list", () => {
		vi.mocked(useDriveFiles).mockReturnValue({
			data: {
				files: [
					{
						id: "df-1",
						email_id: "email-1",
						filename: "invoice.pdf",
						mimetype: "application/pdf",
						size: 12345,
						created_at: "2026-04-30T10:00:00Z",
					},
				],
				totalCount: 1,
			},
			isLoading: false,
		} as any);

		renderWithProviders(<DrivePage />);
		expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
	});
});
