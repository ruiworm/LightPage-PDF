import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FileRedactionActions from "@app/components/tools/redact/FileRedactionActions";

const session = vi.hoisted(() => ({
  documents: [
    {
      id: "legacy",
      file: { name: "legacy.pdf" },
      kind: "pdf",
      pages: [{ index: 0 }, { index: 1 }],
      warnings: ["legacyWordPdf"],
    },
  ],
  activeDocumentId: "legacy",
  activePageIndex: 0,
  busy: false,
  errors: [],
  setActivePage: vi.fn(),
}));
vi.mock("@app/contexts/FileRedactionContext", () => ({
  useFileRedaction: () => session,
}));
beforeEach(() => {
  session.activePageIndex = 0;
  session.busy = false;
  session.documents[0].warnings = ["legacyWordPdf"];
});
afterEach(cleanup);

function showActions() {
  render(
    <MantineProvider>
      <FileRedactionActions />
    </MantineProvider>,
  );
}

it("lets a normalized legacy Word document reach a page without any sensitive hits", () => {
  showActions();
  expect(screen.getByText("1 / 2")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "viewer.previousPage" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "viewer.nextPage" }));
  expect(session.setActivePage).toHaveBeenCalledWith(1);
});
it("prevents navigating beyond the final legacy Word page", () => {
  session.activePageIndex = 1;
  showActions();
  expect(
    screen.getByRole("button", { name: "viewer.nextPage" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "viewer.previousPage" }));
  expect(session.setActivePage).toHaveBeenCalledWith(0);
});
it("leaves ordinary PDFs on their existing reader navigation", () => {
  session.documents[0].warnings = [];
  showActions();
  expect(screen.queryByRole("button", { name: "viewer.nextPage" })).toBeNull();
});
