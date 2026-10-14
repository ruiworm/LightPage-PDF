import { createContext, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { StirlingFile } from "@app/types/fileContext";
import type { WorkbenchType } from "@app/types/workbench";
import type { ToolId } from "@app/types/toolId";
import type { CustomWorkbenchViewInstance } from "@app/contexts/ToolWorkflowContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";
import WorkbenchBar from "@app/components/shared/WorkbenchBar";

const files: StirlingFile[] = [];
const viewer = {
  activeFileId: null as string | null,
  setActiveFileId: vi.fn(),
};
const fileActions = {
  removeFiles: vi.fn(),
  setSelectedFiles: vi.fn(),
  updateStirlingFileStub: vi.fn(),
};
const saveAsCopy = vi.fn();
const download = vi.fn();
const setCurrentView = vi.fn();
const handleToolSelect = vi.fn();
const navigation = { selectedTool: null as ToolId | null };
const customWorkbenchViews: CustomWorkbenchViewInstance[] = [];
let leftPanelView = "toolContent";
const exportContext = createContext({ exportActions: { saveAsCopy } });

vi.mock("@app/contexts/ViewerContext", () => ({
  get ViewerContext() {
    return exportContext;
  },
  useViewer: () => viewer,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files }),
  useFileSelection: () => ({
    selectedFiles: files.slice(0, 2),
    selectedFileIds: files.slice(0, 2).map((file) => file.fileId),
  }),
  useFileActions: () => ({ actions: fileActions }),
  useFileSelectors: () => ({
    getStirlingFileStub: (id: string) => ({
      id,
      name: id === files[2]?.fileId ? "Renamed C.pdf" : "Selected A.pdf",
    }),
  }),
}));
vi.mock("@app/contexts/WorkbenchBarContext", () => ({
  useWorkbenchBar: () => ({
    buttons: [],
    actions: {},
    allButtonsDisabled: false,
  }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => navigation,
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    customWorkbenchViews,
    handleToolSelect,
    leftPanelView,
  }),
}));
vi.mock("@app/contexts/TitleBarStripContext", () => ({
  useTitleBarStrip: () => ({ enabled: false }),
}));
vi.mock("@app/hooks/useFileActionTerminology", () => ({
  useFileActionTerminology: () => ({ download: "Download" }),
}));
vi.mock("@app/hooks/useFileActionIcons", () => ({
  useFileActionIcons: () => ({ download: "download" }),
}));
vi.mock("@app/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@app/hooks/useSharingEnabled", () => ({
  useSharingEnabled: () => ({ sharingEnabled: false }),
}));
vi.mock("@app/hooks/usePolicyFileBadges", () => ({
  usePolicyFileBadges: () => new Map(),
}));
vi.mock("@app/components/policies/policyRunStore", () => ({
  POLICY_IN_FLIGHT_STATUSES: [],
  usePolicyRuns: () => [],
}));
vi.mock("@app/services/exportWithPolicy", () => ({
  downloadFileWithPolicy: (...args: unknown[]) => download(...args),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/ui/SegmentedControl", () => ({
  SegmentedControl: ({
    options,
    onChange,
  }: {
    options: { value: WorkbenchType; label: ReactNode }[];
    onChange: (view: WorkbenchType) => void;
  }) => (
    <>
      {options.map(({ value, label }) => (
        <button key={value} onClick={() => onChange(value)}>
          {label}
        </button>
      ))}
    </>
  ),
}));
vi.mock(
  "@app/components/shared/workbenchBar/WorkbenchBarDesktopActions",
  () => ({
    default: ({
      onExport,
      onClose,
      actionsDisabled,
    }: {
      onExport: () => void;
      onClose: () => void;
      actionsDisabled: boolean;
    }) => (
      <>
        <button onClick={onExport} disabled={actionsDisabled}>
          Download
        </button>
        <button onClick={onClose} disabled={actionsDisabled}>
          Close
        </button>
      </>
    ),
  }),
);

beforeEach(() => {
  vi.clearAllMocks();
  navigation.selectedTool = null;
  leftPanelView = "toolContent";
  customWorkbenchViews.splice(0);
  files.splice(
    0,
    files.length,
    ...["A.pdf", "B.pdf", "C.pdf"].map((name) => createTestStirlingFile(name)),
  );
  viewer.activeFileId = files[2].fileId;
  saveAsCopy.mockResolvedValue(new ArrayBuffer(8));
  download.mockResolvedValue({});
});

function renderBar(currentView: WorkbenchType = "viewer", hasFiles = true) {
  return render(
    <MemoryRouter>
      <WorkbenchBar
        currentView={currentView}
        setCurrentView={setCurrentView}
        hasFiles={hasFiles}
      />
    </MemoryRouter>,
  );
}

it("keeps all three workbench tabs available before selecting a tool or file", () => {
  files.splice(0);
  viewer.activeFileId = null;
  renderBar("viewer", false);
  expect(screen.getByRole("button", { name: "Read" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Organize" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  expect(handleToolSelect).not.toHaveBeenCalled();
});

it("opens page organization through its tool workflow from the reader", async () => {
  navigation.selectedTool = "merge";
  renderBar();
  await userEvent.click(screen.getByRole("button", { name: "Organize" }));
  expect(handleToolSelect).toHaveBeenCalledWith("multiTool");
  expect(setCurrentView).not.toHaveBeenCalled();
});

it("keeps both tabs available in a custom PDF editor", async () => {
  navigation.selectedTool = "pdfTextEditor";
  renderBar("custom:pdfTextEditor");
  expect(screen.getByRole("button", { name: "Read" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Organize" }));
  expect(handleToolSelect).toHaveBeenCalledWith("multiTool");
});

it("returns to the reader without changing workspace membership", async () => {
  navigation.selectedTool = "multiTool";
  renderBar("pageEditor");
  await userEvent.click(screen.getByRole("button", { name: "Read" }));
  expect(setCurrentView).toHaveBeenCalledWith("viewer");
  expect(handleToolSelect).not.toHaveBeenCalled();
  expect(fileActions.setSelectedFiles).not.toHaveBeenCalled();
});

it("exports the viewed C with its own name while A and B are checked", async () => {
  renderBar();
  await userEvent.click(screen.getByRole("button", { name: "Download" }));
  await waitFor(() =>
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "Renamed C.pdf",
        fileId: files[2].fileId,
      }),
    ),
  );
});

it("closing the reader preserves the loaded files and workspace selection", async () => {
  renderBar();
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(viewer.setActiveFileId).toHaveBeenCalledWith(null);
  expect(fileActions.removeFiles).not.toHaveBeenCalled();
  expect(fileActions.setSelectedFiles).not.toHaveBeenCalled();
});

it("disables reader actions when only workspace files are selected", () => {
  viewer.activeFileId = null;
  renderBar();
  expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
});

it("opens the PDF editing tool from its permanent tab before it has registered a view", async () => {
  renderBar();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(handleToolSelect).toHaveBeenCalledWith("pdfTextEditor");
  expect(setCurrentView).not.toHaveBeenCalled();
});

it("reuses a ready PDF editor without duplicating the permanent tab", async () => {
  navigation.selectedTool = "pdfTextEditor";
  customWorkbenchViews.push({
    id: "pdfTextEditorWorkbench",
    workbenchId: "custom:pdfTextEditor",
    label: "Editor",
    data: {},
    component: () => null,
  });
  renderBar();
  expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Editor", exact: true }),
  ).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(setCurrentView).toHaveBeenCalledWith("custom:pdfTextEditor");
  expect(handleToolSelect).not.toHaveBeenCalled();
});

it("uses the guarded tool workflow when a different tool owns the panel", async () => {
  navigation.selectedTool = "merge";
  customWorkbenchViews.push({
    id: "pdfTextEditorWorkbench",
    workbenchId: "custom:pdfTextEditor",
    label: "Editor",
    data: {},
    component: () => null,
  });
  renderBar();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(handleToolSelect).toHaveBeenCalledWith("pdfTextEditor");
  expect(setCurrentView).not.toHaveBeenCalled();
});

it("reopens the retained editor inspector after organizing without selecting a new tool", async () => {
  navigation.selectedTool = "pdfTextEditor";
  leftPanelView = "toolPicker";
  customWorkbenchViews.push({
    id: "pdfTextEditorWorkbench",
    workbenchId: "custom:pdfTextEditor",
    label: "Editor",
    data: {},
    component: () => null,
  });
  renderBar("pageEditor");
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(handleToolSelect).toHaveBeenCalledWith("pdfTextEditor");
  expect(setCurrentView).not.toHaveBeenCalled();
});
