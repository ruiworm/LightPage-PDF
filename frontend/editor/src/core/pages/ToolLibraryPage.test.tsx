import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import ToolRegistryContext from "@app/contexts/ToolRegistryContext";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistry,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import ToolLibraryPage from "@app/pages/ToolLibraryPage";
import ToolPanel from "@app/components/tools/ToolPanel";
import { EditorDefaultsCard } from "@app/components/shared/config/configSections/preferences/EditorDefaultsCard";
import { preferencesService } from "@app/services/preferencesService";

const selectTool = vi.fn();
const makeTool = (name: string, recommended: boolean): ToolRegistryEntry => ({
  name,
  description: `${name} description`,
  icon: null,
  component: () => null,
  automationSettings: null,
  categoryId: recommended
    ? ToolCategoryId.RECOMMENDED_TOOLS
    : ToolCategoryId.STANDARD_TOOLS,
  subcategoryId: SubcategoryId.PAGE_FORMATTING,
});
const registry = {
  merge: makeTool("Merge PDF", true),
  rotate: makeTool("Rotate pages", false),
  split: makeTool("Split PDF", false),
  ocr: makeTool("OCR", false),
  editTableOfContents: {
    ...makeTool("Edit bookmarks", false),
    subcategoryId: SubcategoryId.DOCUMENT_REVIEW,
  },
  validateSignature: {
    ...makeTool("Verify signatures", false),
    subcategoryId: SubcategoryId.VERIFICATION,
  },
  certSign: {
    ...makeTool("Certificate signing", false),
    subcategoryId: SubcategoryId.SIGNING,
  },
  extractImages: {
    ...makeTool("Extract images", false),
    subcategoryId: SubcategoryId.EXTRACTION,
  },
  automate: { ...makeTool("Automation", false), hiddenFromToolList: true },
} as ToolRegistry;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/{{(\w+)}}/g, (_, key) => String(values?.[key] ?? "")),
  }),
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/shared/ToolIcon", () => ({ ToolIcon: () => null }));
vi.mock("@app/hooks/useDocumentMeta", () => ({ useDocumentMeta: () => {} }));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { premiumEnabled: false } }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: "viewer" }),
  useNavigationGuard: () => ({ requestNavigation: (go: () => void) => go() }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflowData: () => ({
    toolRegistry: registry,
    toolAvailability: {
      ocr: { available: false, reason: "missingDependency" },
    },
  }),
  useToolWorkflow: () => ({
    toolRegistry: registry,
    toolAvailability: {
      ocr: { available: false, reason: "missingDependency" },
    },
    leftPanelView: "toolPicker",
    selectedToolKey: null,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    handleToolSelect: selectTool,
  }),
}));
vi.mock("@app/components/shared/quickNav/QuickNavHostBridge", () => ({
  QuickNavHostBridge: () => null,
}));
vi.mock("@app/components/tools/ToolPanelViewerBar", () => ({
  ToolPanelViewerBar: () => null,
}));
vi.mock("@app/components/tools/ToolRenderer", () => ({ default: () => null }));
vi.mock("@app/components/tools/toolPicker/ToolButton", () => ({
  default: ({
    id,
    tool,
    onSelect,
  }: {
    id: string;
    tool: ToolRegistryEntry;
    onSelect: (id: string) => void;
  }) => <button onClick={() => onSelect(id)}>{tool.name}</button>,
}));

function Pages() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/tools")}>Library page</button>
      <button onClick={() => navigate("/editor")}>Editor page</button>
      <output aria-label="Current path">{pathname}</output>
      {pathname === "/tools" ? <ToolLibraryPage /> : <ToolPanel />}
    </>
  );
}

function setup(settings = false) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/tools"]}>
        <PreferencesProvider>
          <ToolRegistryContext.Provider
            value={{
              allTools: registry,
              regularTools: registry,
              superTools: registry,
              linkTools: registry,
              getToolById: (id) => (id ? registry[id] : null),
            }}
          >
            {settings ? <EditorDefaultsCard /> : <Pages />}
          </ToolRegistryContext.Provider>
        </PreferencesProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  preferencesService.setServerDefaults({});
  selectTool.mockClear();
});

it("groups related tools together regardless of recommendation or legacy subcategory", () => {
  setup();
  const pageTools = within(
    screen.getByRole("region", { name: "Page organization 3" }),
  );
  expect(pageTools.getByTestId("library-tool-merge")).toBeTruthy();
  expect(pageTools.getByTestId("library-tool-rotate")).toBeTruthy();
  expect(pageTools.getByTestId("library-tool-split")).toBeTruthy();
  const conversions = within(
    screen.getByRole("region", { name: "Conversion & optimization 2" }),
  );
  expect(conversions.getByTestId("library-tool-ocr")).toBeTruthy();
  expect(conversions.getByTestId("library-tool-extractImages")).toBeTruthy();
  const security = within(
    screen.getByRole("region", { name: "Security & signatures 2" }),
  );
  expect(security.getByTestId("library-tool-certSign")).toBeTruthy();
  expect(security.getByTestId("library-tool-validateSignature")).toBeTruthy();
  expect(screen.getAllByTestId(/^library-tool-/)).toHaveLength(8);
});

it("starts with recommended tools, adds to the sidebar without opening a tool, and persists across page changes and remounts", () => {
  const view = setup();
  expect(screen.getByText("1 tools in sidebar")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Add Rotate pages to sidebar" }),
  );
  expect(screen.getByLabelText("Current path").textContent).toBe("/tools");
  expect(selectTool).not.toHaveBeenCalled();
  expect(screen.getByText("Added Rotate pages to sidebar")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Editor page" }));
  const sidebar = within(screen.getByTestId("sidebar-tools"));
  expect(sidebar.getByRole("button", { name: "Merge PDF" })).toBeTruthy();
  expect(sidebar.getByRole("button", { name: "Rotate pages" })).toBeTruthy();
  expect(sidebar.queryByRole("button", { name: "Split PDF" })).toBeNull();
  view.unmount();
  setup();
  expect(
    screen.getByRole("button", { name: "Remove Rotate pages from sidebar" }),
  ).toBeTruthy();
});

it("removes a recommended tool and preserves an intentionally empty sidebar", () => {
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Merge PDF from sidebar" }),
  );
  expect(preferencesService.getPreference("sidebarToolIds")).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Editor page" }));
  expect(
    within(screen.getByTestId("sidebar-tools")).queryByRole("button"),
  ).toBeNull();
  expect(
    screen.getByText("Add tools from the tool library to get started."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Manage sidebar tools" }));
  expect(screen.getByLabelText("Current path").textContent).toBe("/tools");
  expect(
    screen.getByRole("button", { name: "Add Merge PDF to sidebar" }),
  ).toBeTruthy();
  expect(selectTool).not.toHaveBeenCalled();
});

it("searches the catalog, toggles descriptions, and recovers from an empty search", () => {
  setup();
  expect(screen.queryByText("Rotate pages description")).toBeNull();
  fireEvent.click(
    screen.getByRole("switch", { name: "Show tool descriptions" }),
  );
  expect(screen.getByText("Rotate pages description")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Search tools" }), {
    target: { value: "Rotate" },
  });
  expect(screen.getByTestId("library-tool-rotate")).toBeTruthy();
  expect(screen.queryByTestId("library-tool-merge")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Search tools" }), {
    target: { value: "zzzzzzzzzz" },
  });
  expect(screen.getByText("No matching tools")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByTestId("library-tool-merge")).toBeTruthy();
  expect(screen.queryByTestId("library-tool-automate")).toBeNull();
});

it("blocks adding unavailable tools but allows removing an unavailable saved tool", () => {
  const view = setup();
  expect(
    (
      screen.getByRole("button", {
        name: "Add OCR to sidebar",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  view.unmount();
  preferencesService.setPreference("sidebarToolIds", ["ocr"]);
  setup();
  const remove = screen.getByRole("button", {
    name: "Remove OCR from sidebar",
  });
  expect((remove as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(remove);
  expect(preferencesService.getPreference("sidebarToolIds")).toEqual([]);
});

it("keeps the editor in sidebar mode when an old installation saved fullscreen preferences", () => {
  localStorage.setItem(
    "stirlingpdf_preferences",
    JSON.stringify({
      defaultToolPanelMode: "fullscreen",
      toolPanelModePromptSeen: false,
      sidebarToolIds: ["rotate"],
    }),
  );
  preferencesService.setServerDefaults({ defaultToolPanelMode: "fullscreen" });
  expect(preferencesService.getPreference("defaultToolPanelMode")).toBe(
    "sidebar",
  );
  expect(preferencesService.getAllPreferences().defaultToolPanelMode).toBe(
    "sidebar",
  );
  expect(preferencesService.getAllPreferences().toolPanelModePromptSeen).toBe(
    true,
  );
  expect(preferencesService.getPreference("sidebarToolIds")).toEqual([
    "rotate",
  ]);
});

it("keeps reader zoom without offering the retired editor preferences", () => {
  setup(true);
  expect(screen.queryByText("Default tool picker mode")).toBeNull();
  expect(screen.queryByText("Fullscreen")).toBeNull();
  expect(screen.queryByText("Default view on launch")).toBeNull();
  expect(
    screen.getByRole("textbox", { name: "Default reader zoom" }),
  ).toBeTruthy();
});

it("removes an entry directly from the sidebar without opening a tool and synchronizes the library", () => {
  preferencesService.setPreference("sidebarToolIds", ["merge", "rotate"]);
  const view = setup();
  fireEvent.click(screen.getByRole("button", { name: "Editor page" }));
  const sidebar = within(screen.getByTestId("sidebar-tools"));
  fireEvent.click(
    sidebar.getByRole("button", { name: "Remove Rotate pages from sidebar" }),
  );
  expect(
    sidebar.queryByRole("button", { name: "Rotate pages", exact: true }),
  ).toBeNull();
  expect(
    sidebar.getByRole("button", { name: "Merge PDF", exact: true }),
  ).toBeTruthy();
  expect(selectTool).not.toHaveBeenCalled();
  expect(preferencesService.getPreference("sidebarToolIds")).toEqual(["merge"]);
  fireEvent.click(screen.getByRole("button", { name: "Library page" }));
  expect(
    screen.getByRole("button", { name: "Add Rotate pages to sidebar" }),
  ).toBeTruthy();
  view.unmount();
  setup();
  expect(
    screen.getByRole("button", { name: "Add Rotate pages to sidebar" }),
  ).toBeTruthy();
});

it("allows removing an unavailable saved tool directly from the sidebar", () => {
  preferencesService.setPreference("sidebarToolIds", ["ocr"]);
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Editor page" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Remove OCR from sidebar" }),
  );
  expect(preferencesService.getPreference("sidebarToolIds")).toEqual([]);
  expect(selectTool).not.toHaveBeenCalled();
});
