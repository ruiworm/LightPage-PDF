import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { FileItem } from "@app/components/shared/FileSidebarFileItem";
import { getFileColor } from "@app/components/pageEditor/fileColors";
import type { FileId } from "@app/types/file";

vi.mock("@app/hooks/useLazyThumbnail", () => ({
  useLazyThumbnail: () => undefined,
}));
vi.mock("@app/hooks/useFileActionIcons", () => ({
  useFileActionIcons: () => ({ download: "download" }),
}));
vi.mock("@app/hooks/useFileActionTerminology", () => ({
  useFileActionTerminology: () => ({ download: "Download" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => String(options?.[key])),
  }),
}));

function mount(
  isSelected = false,
  isViewedInViewer = false,
  fileColorIndex?: number,
) {
  const onView = vi.fn();
  const onSelect = vi.fn();
  const row = (selected: boolean) => (
    <MantineProvider>
      <FileItem
        fileId={"a" as FileId}
        name="A.pdf"
        isSelected={selected}
        fileColorIndex={fileColorIndex}
        isViewedInViewer={isViewedInViewer}
        isActive={isViewedInViewer}
        onClick={onView}
        onSelectionToggle={onSelect}
      />
    </MantineProvider>
  );
  const view = render(row(isSelected));
  return {
    onView,
    onSelect,
    setSelected: (selected: boolean) => view.rerender(row(selected)),
  };
}

describe("file sidebar row", () => {
  it("an unselected reader file has no workspace selection color", () => {
    mount(false, true, 1);
    const row = screen
      .getByRole("button", { name: /A.pdf/ })
      .closest<HTMLElement>(".file-sidebar-file-item")!;
    expect(row).not.toHaveClass("selected");
    expect(row.style.getPropertyValue("--file-selection-color")).toBe("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("removes the row color when unchecked while keeping the reader open", () => {
    const { setSelected } = mount(true, true, 1);
    const row = screen
      .getByRole("button", { name: /A.pdf/ })
      .closest<HTMLElement>(".file-sidebar-file-item")!;
    expect(row.style.getPropertyValue("--file-selection-color")).toBe(
      getFileColor(1),
    );
    setSelected(false);
    expect(row.style.getPropertyValue("--file-selection-color")).toBe("");
    expect(row).not.toHaveClass("selected");
    expect(screen.getByRole("button", { name: /A.pdf/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("clicking the filename only views the file, with no eye button", async () => {
    const { onView, onSelect } = mount();
    await userEvent.click(screen.getByRole("button", { name: /A.pdf/ }));
    expect(onView).toHaveBeenCalledWith("a");
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Open in viewer" }),
    ).not.toBeInTheDocument();
  });

  it("clicking the checkbox only changes workspace membership", async () => {
    const { onView, onSelect } = mount();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select A.pdf for processing" }),
    );
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(onView).not.toHaveBeenCalled();
  });

  it("the current viewer file can be unchecked without closing its reader", async () => {
    const { onView, onSelect } = mount(true, true);
    expect(screen.getByRole("button", { name: /A.pdf/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onView).not.toHaveBeenCalled();
  });

  it("supports keyboard selection independently of keyboard viewing", async () => {
    const { onView, onSelect } = mount();
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onView).not.toHaveBeenCalled();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onView).toHaveBeenCalledOnce();
  });
});
