import { useEffect, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import ToolPanel from "@app/components/tools/ToolPanel";
import { useViewActive } from "@app/components/layout/RetainedView";

const session = { view: "viewer", tool: "pdfTextEditor", opens: 0, closes: 0 };
vi.mock("@mantine/core", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: session.view }),
  useNavigationGuard: () => ({ requestNavigation: (go: () => void) => go() }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    selectedToolKey: session.tool,
    leftPanelView: "toolContent",
    searchQuery: "",
    toolRegistry: {},
    toolAvailability: {},
    handleToolSelect: vi.fn(),
  }),
}));
vi.mock("@app/hooks/tools/useSidebarTools", () => ({
  useSidebarTools: () => ({ sidebarToolIds: [], toggleSidebarTool: vi.fn() }),
}));
vi.mock("@app/components/tools/ToolPanelViewerBar", () => ({
  ToolPanelViewerBar: () => null,
}));
vi.mock("@app/ui/ActionIcon", () => ({ ActionIcon: () => null }));
vi.mock("@app/ui/Button", () => ({
  Button: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/tools/ToolRenderer", () => ({
  default: function Controller({
    selectedToolKey,
  }: {
    selectedToolKey: string;
  }) {
    const active = useViewActive();
    useEffect(() => {
      if (selectedToolKey !== "pdfTextEditor") return;
      session.opens++;
      return () => {
        session.closes++;
      };
    }, [selectedToolKey]);
    return selectedToolKey === "pdfTextEditor" ? (
      <div data-testid="controller">{active ? "Active" : "Paused"}</div>
    ) : null;
  },
}));

it("mounts before its canvas is registered, then retains the controller across tab changes", () => {
  const view = () => (
    <MemoryRouter>
      <ToolPanel />
    </MemoryRouter>
  );
  const app = render(view());
  expect(screen.getByTestId("controller")).toHaveTextContent("Paused");
  expect(screen.getByTestId("sidebar-tools")).toBeInTheDocument();
  session.view = "custom:pdfTextEditor";
  app.rerender(view());
  expect(screen.getByTestId("controller")).toHaveTextContent("Active");
  expect(screen.queryByTestId("sidebar-tools")).toBeNull();
  session.view = "pageEditor";
  app.rerender(view());
  expect(screen.getByTestId("controller")).toHaveTextContent("Paused");
  expect(screen.getByTestId("sidebar-tools")).toBeInTheDocument();
  session.view = "custom:pdfTextEditor";
  session.tool = "pdfTextEditor";
  app.rerender(view());
  expect(session.opens).toBe(1);
  expect(session.closes).toBe(0);
  app.unmount();
  expect(session.closes).toBe(1);
});
