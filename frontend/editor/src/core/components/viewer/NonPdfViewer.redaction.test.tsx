import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NonPdfViewer } from "@app/components/viewer/NonPdfViewer";

const session = vi.hoisted(() => ({
  documents: [{ id: "legacy", kind: "pdf" }],
  selectedToolKey: "redact",
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    selectedToolKey: session.selectedToolKey,
    handleToolSelect: vi.fn(),
    toolAvailability: { convert: { available: true } },
  }),
}));
vi.mock("@app/components/viewer/nonpdf/DocxViewer", () => ({
  default: () => <div>Ready DOCX preview</div>,
}));
vi.mock("@app/components/viewer/nonpdf/LegacyWordViewer", () => ({
  default: () => <div>Ready DOC preview</div>,
}));
vi.mock("@app/contexts/FileRedactionContext", () => ({
  useOptionalFileRedaction: () => session,
}));
vi.mock("@app/components/tools/redact/NonPdfRedactionPreview", () => ({
  default: ({ document }: { document: { id: string; kind: string } }) => (
    <div data-testid="normalized-redaction">
      {document.id}:{document.kind}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  session.selectedToolKey = "redact";
});

it("reviews an analyzed legacy Word file through its normalized PDF", async () => {
  const file = Object.assign(new File(["legacy"], "legacy.doc"), {
    fileId: "legacy",
    quickKey: "legacy",
  });
  render(
    <MantineProvider>
      <NonPdfViewer file={file} />
    </MantineProvider>,
  );
  expect(await screen.findByTestId("normalized-redaction")).toHaveTextContent(
    "legacy:pdf",
  );
});
it("does not show another file's cached normalized redaction", async () => {
  const file = Object.assign(new File(["other"], "other.doc"), {
    fileId: "other",
    quickKey: "other",
  });
  render(
    <MantineProvider>
      <NonPdfViewer file={file} />
    </MantineProvider>,
  );
  await screen.findByText("Ready DOC preview");
  expect(screen.queryByTestId("normalized-redaction")).toBeNull();
});
it("keeps the redaction preview out of other tools", async () => {
  session.selectedToolKey = "convert";
  const file = Object.assign(new File(["legacy"], "legacy.doc"), {
    fileId: "legacy",
    quickKey: "legacy",
  });
  render(
    <MantineProvider>
      <NonPdfViewer file={file} />
    </MantineProvider>,
  );
  await screen.findByText("Ready DOC preview");
  expect(screen.queryByTestId("normalized-redaction")).toBeNull();
});
it.each(["doc", "docx"])(
  "keeps the conversion banner out of a %s preview",
  async (extension) => {
    session.selectedToolKey = "convert";
    render(
      <MantineProvider>
        <NonPdfViewer file={new File(["word"], `source.${extension}`)} />
      </MantineProvider>,
    );
    await screen.findByText(`Ready ${extension.toUpperCase()} preview`);
    expect(
      screen.queryByRole("button", { name: "viewer.nonPdf.convertToPdf" }),
    ).toBeNull();
  },
);
it("preserves the conversion action for other supported formats", () => {
  render(
    <MantineProvider>
      <NonPdfViewer file={new File(["image"], "source.png")} />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("button", { name: "viewer.nonPdf.convertToPdf" }),
  ).toBeInTheDocument();
});
