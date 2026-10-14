import { MantineProvider } from "@mantine/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DocxViewer from "@app/components/viewer/nonpdf/DocxViewer";
import { getWordPreview } from "@app/services/wordPreviewCache";

const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("docx-preview", () => ({ renderAsync: mocks.render }));
vi.mock("@app/components/viewer/nonpdf/ZoomablePreview", () => ({
  ZoomablePreview: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.render.mockImplementation(async (_file: Blob, host: HTMLDivElement) => {
    host.innerHTML = "<p>Word content</p>";
  });
});
afterEach(cleanup);
function show(file: File) {
  return render(
    <MantineProvider>
      <DocxViewer file={file} />
    </MantineProvider>,
  );
}

it("restores a cloned ready layout after unmount without parsing Word again", async () => {
  const file = new File(["word"], "source.docx");
  const view = show(file);
  expect(await screen.findByText("Word content")).toBeVisible();
  view.unmount();
  show(file);
  expect(await screen.findByText("Word content")).toBeVisible();
  expect(mocks.render).toHaveBeenCalledOnce();
});

it("parses changed source bytes even when the filename stays the same", async () => {
  const view = show(new File(["before"], "same.docx"));
  await screen.findByText("Word content");
  mocks.render.mockImplementationOnce(
    async (_file: Blob, host: HTMLDivElement) => {
      host.innerHTML = "<p>Changed Word</p>";
    },
  );
  view.rerender(
    <MantineProvider>
      <DocxViewer file={new File(["after"], "same.docx")} />
    </MantineProvider>,
  );
  expect(await screen.findByText("Changed Word")).toBeVisible();
  expect(screen.queryByText("Word content")).toBeNull();
  expect(mocks.render).toHaveBeenCalledTimes(2);
});

it("does not mount or cache a previous file's late layout", async () => {
  let complete!: () => void;
  const first = new File(["first"], "first.docx");
  mocks.render.mockImplementationOnce(
    (_file: Blob, host: HTMLDivElement) =>
      new Promise<void>((resolve) => {
        complete = () => {
          host.innerHTML = "<p>Stale Word</p>";
          resolve();
        };
      }),
  );
  const view = show(first);
  await waitFor(() => expect(mocks.render).toHaveBeenCalledOnce());
  view.rerender(
    <MantineProvider>
      <DocxViewer file={new File(["second"], "second.docx")} />
    </MantineProvider>,
  );
  await screen.findByText("Word content");
  await act(async () => complete());
  expect(screen.queryByText("Stale Word")).toBeNull();
  expect(getWordPreview(first)).toBeUndefined();
});

it("shows failures and permits a fresh attempt instead of caching an error", async () => {
  const file = new File(["retry"], "retry.docx");
  mocks.render.mockRejectedValueOnce(new Error("invalid"));
  const view = show(file);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "fileRedaction.wordLayoutUnavailable",
  );
  expect(getWordPreview(file)).toBeUndefined();
  view.unmount();
  show(file);
  expect(await screen.findByText("Word content")).toBeVisible();
  expect(mocks.render).toHaveBeenCalledTimes(2);
});
