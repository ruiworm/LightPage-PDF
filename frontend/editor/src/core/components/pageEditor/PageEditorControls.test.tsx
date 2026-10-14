import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PageEditorControls from "@app/components/pageEditor/PageEditorControls";

afterEach(cleanup);
const props = {
  onClosePdf: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  canUndo: false,
  canRedo: false,
  onRotate: vi.fn(),
  onDelete: vi.fn(),
  onSplit: vi.fn(),
  onSplitAll: vi.fn(),
  onPageBreak: vi.fn(),
  onPageBreakAll: vi.fn(),
  onExportAll: vi.fn(),
  exportLoading: false,
  selectionMode: true,
  displayDocument: {
    pages: [
      { id: "a", pageNumber: 1 },
      { id: "b", pageNumber: 2 },
      { id: "loading", pageNumber: 3, isPlaceholder: true },
    ],
  },
};
it("counts only actual pages while a removed source or loading placeholder is still in selection", () => {
  render(
    <MantineProvider>
      <PageEditorControls
        {...props}
        selectedPageIds={["a", "b", "loading", "removed"]}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("button", {
      name: "pageEditor.toolbar.insertBlankPages (2)",
    }),
  ).toBeEnabled();
});
it("disables page operations when only invalid or loading IDs remain", () => {
  render(
    <MantineProvider>
      <PageEditorControls {...props} selectedPageIds={["loading", "removed"]} />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("button", { name: "pageEditor.toolbar.insertBlankPages" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "pageEditor.toolbar.delete" }),
  ).toBeDisabled();
});
