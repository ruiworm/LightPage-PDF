import { MantineProvider } from "@mantine/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { defaultRedactionSettings } from "@app/services/fileRedaction/rules";
import { createStirlingFile } from "@app/types/fileContext";
import FileRedactionPanel from "@app/components/tools/redact/FileRedactionPanel";

const mocks = vi.hoisted(() => ({
  files: [] as File[],
  selected: [] as File[],
  active: "pdf",
  addFiles: vi.fn(),
  open: vi.fn(),
  analyse: vi.fn(),
  errors: [] as { file: string; code: string }[],
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files: mocks.files }),
  useSelectedFiles: () => ({ selectedFiles: mocks.selected }),
  useFileContext: () => ({ addFiles: mocks.addFiles }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    activeFileId: mocks.active,
    setActiveFileId: mocks.open,
  }),
}));
vi.mock("@app/contexts/FileRedactionContext", () => ({
  useFileRedaction: () => ({
    settings: defaultRedactionSettings,
    documents: [],
    hits: [],
    busy: false,
    errors: mocks.errors,
    analyse: mocks.analyse,
  }),
}));
vi.mock("@app/components/tools/redact/FileRedactionActions", () => ({
  default: () => <div data-testid="actions" />,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.files = [
    createStirlingFile(new File(["pdf"], "current.pdf"), "pdf"),
    createStirlingFile(new File(["xlsx"], "other.xlsx"), "xlsx"),
  ];
  mocks.selected = [mocks.files[1]];
  mocks.active = "pdf";
  mocks.errors = [];
  mocks.analyse.mockResolvedValue(undefined);
  mocks.addFiles.mockResolvedValue([{ fileId: "new" }]);
});
afterEach(cleanup);
function show() {
  return render(
    <MantineProvider>
      <FileRedactionPanel />
    </MantineProvider>,
  );
}
it("scans the open PDF instead of an unrelated previously checked workbook", async () => {
  show();
  expect(screen.getByText("current.pdf")).toBeInTheDocument();
  expect(screen.queryByText("other.xlsx")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "fileRedaction.scan" }));
  await waitFor(() =>
    expect(mocks.analyse).toHaveBeenCalledWith([
      { file: mocks.files[0], id: "pdf" },
    ]),
  );
});
it("retains intentional batch processing when the open file is checked", async () => {
  mocks.selected = mocks.files;
  show();
  fireEvent.click(screen.getByRole("button", { name: "fileRedaction.scan" }));
  await waitFor(() =>
    expect(mocks.analyse).toHaveBeenCalledWith([
      { file: mocks.files[0], id: "pdf" },
      { file: mocks.files[1], id: "xlsx" },
    ]),
  );
});
it("uses checked files when no document is opened", async () => {
  mocks.active = "";
  show();
  fireEvent.click(screen.getByRole("button", { name: "fileRedaction.scan" }));
  await waitFor(() =>
    expect(mocks.analyse).toHaveBeenCalledWith([
      { file: mocks.files[1], id: "xlsx" },
    ]),
  );
});
it("shows a rejected workbook error without disabled export controls above it", () => {
  mocks.active = "xlsx";
  mocks.errors = [{ file: "other.xlsx", code: "TABLE_FORMULAS" }];
  show();
  expect(screen.getByRole("alert")).toHaveTextContent("other.xlsx");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "fileRedaction.errors.TABLE_FORMULAS",
  );
  expect(screen.queryByTestId("actions")).toBeNull();
});
it("keeps another file's error out of the current PDF's inspector", () => {
  mocks.errors = [{ file: "other.xlsx", code: "TABLE_FORMULAS" }];
  show();
  expect(screen.getByText("current.pdf")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("opens the first file added from the inspector so review follows the imported batch", async () => {
  show();
  fireEvent.change(screen.getByLabelText("fileRedaction.addFiles"), {
    target: { files: [new File(["doc"], "new.doc")] },
  });
  await waitFor(() => expect(mocks.open).toHaveBeenCalledWith("new"));
  expect(mocks.addFiles).toHaveBeenCalledWith(expect.any(Array), {
    selectFiles: true,
    skipUploadTracking: true,
  });
});
it("displays unexpected processing failures instead of leaving only a flash", async () => {
  mocks.analyse.mockRejectedValueOnce(new Error("worker shutdown failed"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "fileRedaction.scan" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "fileRedaction.errors.READ_FAILED",
  );
});
