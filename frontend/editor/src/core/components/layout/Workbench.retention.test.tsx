import { useEffect, useState, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Workbench from "@app/components/layout/Workbench";
import { RetainedView } from "@app/components/layout/RetainedView";

const session = vi.hoisted(() => ({
  view: "viewer",
  viewerOpens: 0,
  viewerCloses: 0,
  editorOpens: 0,
  editorCloses: 0,
  textEditorOpens: 0,
  textEditorCloses: 0,
  setWorkbench: vi.fn(),
  setPageEditorFunctions: vi.fn(),
}));
vi.mock("@mantine/core", () => {
  const Surface = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Box: Surface,
    Center: Surface,
    Stack: Surface,
    Text: Surface,
    Loader: () => null,
  };
});
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files: [{ fileId: "pdf" }], fileIds: ["pdf"] }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ activeFileId: "pdf" }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: session.view }),
  useNavigationActions: () => ({
    actions: { setWorkbench: session.setWorkbench },
  }),
}));
vi.mock("@app/contexts/SigningOverlayContext", () => ({
  useSigningOverlay: () => ({ overlay: null }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    previewFile: null,
    setPreviewFile: vi.fn(),
    setPageEditorFunctions: session.setPageEditorFunctions,
    pageEditorFunctions: null,
    customWorkbenchViews: [
      {
        workbenchId: "custom:pdfTextEditor",
        data: {},
        component: TextEditSession,
      },
    ],
    readerMode: false,
    handleToolSelect: vi.fn(),
    selectedToolKey: null,
  }),
}));

function TextEditSession() {
  useEffect(() => {
    session.textEditorOpens++;
    return () => {
      session.textEditorCloses++;
    };
  }, []);
  return <div data-testid="text-editor-document">Editable PDF</div>;
}

beforeEach(() => {
  session.view = "viewer";
  session.viewerOpens = session.viewerCloses = 0;
  session.editorOpens = session.editorCloses = 0;
  session.textEditorOpens = session.textEditorCloses = 0;
});

it("opens each document view once across three repeated tab cycles", async () => {
  const app = render(<Workbench />);
  await screen.findByTestId("pdf-document");
  for (let cycle = 0; cycle < 3; cycle++) {
    session.view = "pageEditor";
    app.rerender(<Workbench />);
    await screen.findByRole("button", { name: "Original page" });
    session.view = "custom:pdfTextEditor";
    app.rerender(<Workbench />);
    await screen.findByTestId("text-editor-document");
    session.view = "viewer";
    app.rerender(<Workbench />);
    await screen.findByTestId("pdf-document");
  }
  expect({
    viewer: session.viewerOpens,
    organize: session.editorOpens,
    edit: session.textEditorOpens,
  }).toEqual({ viewer: 1, organize: 1, edit: 1 });
  expect(session.editorCloses + session.textEditorCloses).toBe(0);
  app.unmount();
  expect(session.editorCloses).toBe(1);
  expect(session.textEditorCloses).toBe(1);
});
vi.mock("@app/components/layout/WorkbenchTakeover", () => ({
  useWorkbenchTakeover: () => null,
}));
vi.mock("@app/components/shared/WorkbenchBar", () => ({ default: () => null }));
vi.mock("@app/components/shared/DismissAllErrorsButton", () => ({
  default: () => null,
}));
vi.mock("@app/components/chat/ChatFAB", () => ({ ChatFAB: () => null }));
vi.mock("@app/components/viewer/Viewer", () => ({
  default: function DocumentSession() {
    useEffect(() => {
      session.viewerOpens++;
      return () => {
        session.viewerCloses++;
      };
    }, []);
    return <div data-testid="pdf-document">PDF</div>;
  },
}));
vi.mock("@app/components/pageEditor/PageEditor", () => ({
  default: function PageEditSession() {
    const [rotated, setRotated] = useState(false);
    useEffect(() => {
      session.editorOpens++;
      return () => {
        session.editorCloses++;
      };
    }, []);
    return (
      <button onClick={() => setRotated(true)}>
        {rotated ? "Rotated page" : "Original page"}
      </button>
    );
  },
}));

it("retains the PDF but closes temporary page editing when leaving the editor app", async () => {
  const view = (active: boolean) => (
    <RetainedView active={active}>
      <Workbench />
    </RetainedView>
  );
  const app = render(view(true));
  const pdf = await screen.findByTestId("pdf-document");
  session.view = "pageEditor";
  app.rerender(view(true));
  fireEvent.click(await screen.findByRole("button", { name: "Original page" }));
  expect(
    screen.getByRole("button", { name: "Rotated page" }),
  ).toBeInTheDocument();
  app.rerender(view(false));
  expect(session.editorCloses).toBe(1);
  expect(session.viewerCloses).toBe(0);
  app.rerender(view(true));
  await screen.findByRole("button", { name: "Original page" });
  expect(session.editorOpens).toBe(2);
  session.view = "viewer";
  app.rerender(view(true));
  expect(screen.getByTestId("pdf-document")).toBe(pdf);
  expect(session.viewerOpens).toBe(1);
  app.unmount();
  expect(session.viewerCloses).toBe(1);
});
