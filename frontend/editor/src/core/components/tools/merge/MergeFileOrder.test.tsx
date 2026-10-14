import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import MergeFileOrder from "@app/components/tools/merge/MergeFileOrder";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => String(options?.[key])),
  }),
}));

const files = ["A.pdf", "B.pdf", "C.pdf"].map((name) =>
  createTestStirlingFile(name, "pdf", "application/pdf"),
);

describe("merge order", () => {
  it("allows keyboard-accessible reorder without changing membership", async () => {
    const onReorder = vi.fn();
    render(
      <MantineProvider>
        <MergeFileOrder files={files} onReorder={onReorder} />
      </MantineProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Move B.pdf up" }),
    );
    expect(onReorder).toHaveBeenCalledWith([
      files[1].fileId,
      files[0].fileId,
      files[2].fileId,
    ]);
    expect(
      screen.getByRole("button", { name: "Move A.pdf up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move C.pdf down" }),
    ).toBeDisabled();
  });

  it("dragging a file changes the exact merge order", () => {
    const onReorder = vi.fn();
    render(
      <MantineProvider>
        <MergeFileOrder files={files} onReorder={onReorder} />
      </MantineProvider>,
    );
    fireEvent.dragStart(screen.getByText("C.pdf").closest("li")!, {
      dataTransfer: { setData: vi.fn() },
    });
    fireEvent.drop(screen.getByText("A.pdf").closest("li")!);
    expect(onReorder).toHaveBeenCalledWith([
      files[2].fileId,
      files[0].fileId,
      files[1].fileId,
    ]);
  });

  it("cannot reorder during processing", () => {
    const onReorder = vi.fn();
    render(
      <MantineProvider>
        <MergeFileOrder files={files} onReorder={onReorder} disabled />
      </MantineProvider>,
    );
    expect(
      screen
        .getAllByRole("button")
        .every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });
});
