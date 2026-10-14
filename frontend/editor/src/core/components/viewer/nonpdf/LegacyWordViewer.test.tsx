import { MantineProvider } from "@mantine/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import LegacyWordViewer from "@app/components/viewer/nonpdf/LegacyWordViewer";

const mocks = vi.hoisted(() => ({
  convert: vi.fn(),
  open: vi.fn(),
  count: vi.fn(),
  close: vi.fn(),
  render: vi.fn(),
  cached: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("@app/services/wordPreviewCache", () => ({
  getWordPreview: mocks.cached,
  cacheWordPreview: mocks.cache,
}));
vi.mock("@app/services/localWordConversion", () => ({
  convertLocalWordToPdf: mocks.convert,
}));
vi.mock("@app/services/pdfiumService", () => ({
  openRawDocumentSafe: mocks.open,
  getRawPageCount: mocks.count,
  closeRawDocument: mocks.close,
}));
vi.mock("@app/utils/pdfiumPageRender", () => ({
  renderPdfiumPageDataUrl: mocks.render,
}));
vi.mock("@app/components/viewer/nonpdf/ZoomablePreview", () => ({
  ZoomablePreview: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cached.mockReturnValue(undefined);
  mocks.convert.mockResolvedValue({
    arrayBuffer: async () => new ArrayBuffer(2),
  });
  mocks.open.mockResolvedValue(10);
  mocks.count.mockResolvedValue(2);
  mocks.close.mockResolvedValue(undefined);
  mocks.render.mockImplementation(
    async (_pointer: number, page: number) =>
      `data:image/png;base64,page${page}`,
  );
});
afterEach(cleanup);
const file = new File(["doc"], "source.doc");
function show(source = file) {
  return render(
    <MantineProvider>
      <LegacyWordViewer file={source} />
    </MantineProvider>,
  );
}
it("previews a DOC without recognition and supports both pages", async () => {
  show();
  expect(await screen.findByText("1 / 2")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "viewer.previousPage" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "viewer.nextPage" }));
  expect(await screen.findByText("2 / 2")).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    "data:image/png;base64,page1",
  );
  expect(
    screen.getByRole("button", { name: "viewer.nextPage" }),
  ).toBeDisabled();
  await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(2));
  expect(mocks.convert).toHaveBeenCalledTimes(1);
});
it("shows conversion failure as a visible recovery message", async () => {
  mocks.convert.mockRejectedValueOnce(new Error("unavailable"));
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "fileRedaction.errors.LEGACY_WORD_UNAVAILABLE",
  );
  expect(mocks.open).not.toHaveBeenCalled();
});
it("reuses a ready first page without repeating conversion or native rendering", async () => {
  mocks.cached.mockReturnValue({
    kind: "doc",
    pdf: new File(["pdf"], "source.pdf"),
    firstPage: { url: "data:image/png;base64,cached", count: 2 },
  });
  show();
  expect(await screen.findByText("1 / 2")).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    "data:image/png;base64,cached",
  );
  expect(mocks.convert).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
});
it("ignores a previous file's late conversion after switching files", async () => {
  let complete!: (pdf: { arrayBuffer: () => Promise<ArrayBuffer> }) => void;
  mocks.convert.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const view = show();
  const previousSignal = mocks.convert.mock.calls[0][1];
  view.rerender(
    <MantineProvider>
      <LegacyWordViewer file={new File(["other"], "other.doc")} />
    </MantineProvider>,
  );
  await screen.findByText("1 / 2");
  expect(previousSignal.aborted).toBe(true);
  await act(async () => {
    complete({ arrayBuffer: async () => new ArrayBuffer(8) });
  });
  expect(mocks.open).toHaveBeenCalledTimes(1);
});
it("releases the native document even when page rendering fails", async () => {
  mocks.render.mockRejectedValueOnce(new Error("render failed"));
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "fileRedaction.errors.READ_FAILED",
  );
  expect(mocks.close).toHaveBeenCalledWith(10);
});
