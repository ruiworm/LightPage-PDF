import { act, render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  NavigationProvider,
  useNavigation,
} from "@app/contexts/NavigationContext";
import {
  ToolWorkflowProvider,
  useToolWorkflow,
} from "@app/contexts/ToolWorkflowContext";

const env = vi.hoisted(() => ({ available: true }));
vi.mock("@app/contexts/ToolRegistryContext", () => ({
  useToolRegistry: () => ({ allTools: {} }),
}));
vi.mock("@app/hooks/useToolManagement", () => ({
  useToolManagement: () => ({
    toolRegistry: {},
    getSelectedTool: () => null,
    toolAvailability: { pdfTextEditor: { available: env.available } },
  }),
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: { defaultStartupView: "tools" },
    updatePreference: vi.fn(),
  }),
}));
vi.mock("@app/hooks/tools/useUserToolActivity", () => ({
  useToolHistory: () => ({
    favoriteTools: [],
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  }),
}));
vi.mock("@app/hooks/useUrlSync", () => ({ useNavigationUrlSync: () => {} }));

let navigation: ReturnType<typeof useNavigation>;
let workflow: ReturnType<typeof useToolWorkflow>;
let transitions: string[];
function Observer() {
  navigation = useNavigation();
  workflow = useToolWorkflow();
  transitions.push(`${navigation.selectedTool}:${navigation.workbench}`);
  return null;
}
function mountReadyEditor() {
  render(
    <NavigationProvider>
      <ToolWorkflowProvider>
        <Observer />
      </ToolWorkflowProvider>
    </NavigationProvider>,
  );
  act(() => {
    workflow.registerCustomWorkbenchView({
      id: "pdfTextEditorWorkbench",
      workbenchId: "custom:pdfTextEditor",
      label: "Edit",
      component: () => null,
    });
    workflow.setCustomWorkbenchViewData("pdfTextEditorWorkbench", {
      ready: true,
    });
    navigation.setToolAndWorkbench("multiTool", "pageEditor");
  });
  transitions = [];
}
beforeEach(() => {
  env.available = true;
  transitions = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
});
it("opens the retained editor in the same update as tool selection", () => {
  mountReadyEditor();
  act(() => workflow.handleToolSelect("pdfTextEditor"));
  expect(transitions).toContain("pdfTextEditor:custom:pdfTextEditor");
  expect(transitions).not.toContain("pdfTextEditor:pageEditor");
});
it("keeps the ready editor tool selected across organizing and editing tabs", () => {
  mountReadyEditor();
  act(() => workflow.handleToolSelect("pdfTextEditor"));
  for (let cycle = 0; cycle < 3; cycle++) {
    act(() => workflow.handleToolSelect("multiTool"));
    expect(navigation.selectedTool).toBe("pdfTextEditor");
    expect(navigation.workbench).toBe("pageEditor");
    expect(workflow.leftPanelView).toBe("toolPicker");
    act(() => workflow.handleToolSelect("pdfTextEditor"));
    expect(navigation.workbench).toBe("custom:pdfTextEditor");
    expect(workflow.leftPanelView).toBe("toolContent");
  }
});
it("still waits for unsaved edits before switching to the retained editor", () => {
  mountReadyEditor();
  act(() => navigation.setHasUnsavedChanges(true));
  act(() => workflow.handleToolSelect("pdfTextEditor"));
  expect(navigation.workbench).toBe("pageEditor");
  expect(navigation.pendingNavigation).not.toBeNull();
  act(() => navigation.setHasUnsavedChanges(false));
  act(() => navigation.confirmNavigation());
  expect(navigation.workbench).toBe("custom:pdfTextEditor");
});
it("promotes a preview before navigating and respects unavailable tools", async () => {
  mountReadyEditor();
  let finish!: () => void;
  act(() =>
    workflow.registerPreviewImport(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  act(() => workflow.handleToolSelect("pdfTextEditor"));
  expect(navigation.workbench).toBe("pageEditor");
  await act(async () => finish());
  expect(navigation.workbench).toBe("custom:pdfTextEditor");
  act(() => navigation.setToolAndWorkbench("multiTool", "pageEditor"));
  env.available = false;
  // Publish availability through a provider render, as server configuration does.
  act(() => workflow.setSearchQuery("changed"));
  act(() => workflow.handleToolSelect("pdfTextEditor"));
  expect(navigation.workbench).toBe("pageEditor");
});
