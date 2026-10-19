import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import FileRedactionActions from "@app/components/tools/redact/FileRedactionActions";
import type { RedactionDocument } from "@app/types/fileRedaction";

const recovery = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@app/services/fileRedaction/recovery", () => ({
  createAliasRecovery: recovery.create,
}));
vi.mock("@app/contexts/FileRedactionContext", () => ({
  useFileRedaction: () => session,
}));
const source: RedactionDocument = {
  id: "doc",
  file: new File(["张三"], "source.pdf"),
  kind: "pdf",
  pages: [],
  warnings: [],
};
const output = new File(["姓名1"], "source_redacted.pdf");
const session = {
  documents: [source],
  activeDocumentId: "doc",
  settings: { method: "alias" },
  busy: false,
  hits: [
    { id: "yes", documentId: "doc", original: "张三", selected: true },
    { id: "no", documentId: "doc", original: "误报", selected: false },
  ],
  replacements: new Map([
    ["yes", "姓名1"],
    ["no", "姓名2"],
  ]),
  exportFiles:
    vi.fn<
      (
        ids: string[],
        onExport?: (document: RedactionDocument, file: File) => void,
      ) => Promise<File[]>
    >(),
};

beforeEach(() => {
  vi.clearAllMocks();
  session.settings.method = "alias";
  session.exportFiles.mockImplementation(async (_ids, onExport) => {
    onExport?.(source, output);
    return [output];
  });
  recovery.create.mockResolvedValue(new File(["recovery"], "data.lp-restore"));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

it("saves a separate recovery file for successful alias exports and labels its download distinctly", async () => {
  const user = userEvent.setup();
  render(
    <MantineProvider>
      <FileRedactionActions />
    </MantineProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: "fileRedaction.export" }),
  );
  expect(
    await screen.findByRole("link", { name: "fileRedaction.downloadResult" }),
  ).toHaveAttribute("download", output.name);
  await user.click(
    screen.getByRole("button", { name: "fileRedaction.restore.save" }),
  );
  await waitFor(() =>
    expect(recovery.create).toHaveBeenCalledExactlyOnceWith([
      {
        original: source.file,
        redacted: output,
        aliases: [{ original: "张三", alias: "姓名1" }],
      },
    ]),
  );
  expect(
    await screen.findByRole("link", { name: "fileRedaction.restore.save" }),
  ).toHaveAttribute("download", "data.lp-restore");
  expect(
    screen.queryByRole("link", { name: "fileRedaction.downloadResult" }),
  ).not.toBeInTheDocument();
});

it("does not offer recovery data for a permanent blackout export", async () => {
  session.settings.method = "blackout";
  const user = userEvent.setup();
  render(
    <MantineProvider>
      <FileRedactionActions />
    </MantineProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: "fileRedaction.export" }),
  );
  await screen.findByRole("link", { name: "fileRedaction.downloadResult" });
  expect(
    screen.queryByRole("button", { name: "fileRedaction.restore.save" }),
  ).not.toBeInTheDocument();
  expect(recovery.create).not.toHaveBeenCalled();
});
