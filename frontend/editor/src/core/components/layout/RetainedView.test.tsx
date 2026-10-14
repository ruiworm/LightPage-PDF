import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RetainedView } from "@app/components/layout/RetainedView";
import {
  WorkbenchBarProvider,
  useWorkbenchBar,
} from "@app/contexts/WorkbenchBarContext";
import { useWorkbenchBarButtons } from "@app/hooks/useWorkbenchBarButtons";

it("keeps a nested document hidden while its parent page is inactive", () => {
  const view = (active: boolean) => (
    <RetainedView active={active}>
      <RetainedView active>
        <div data-testid="document">PDF</div>
      </RetainedView>
    </RetainedView>
  );
  const app = render(view(true));
  const document = screen.getByTestId("document");
  app.rerender(view(false));
  expect(document.parentElement).toHaveStyle({ visibility: "hidden" });
  expect(document.parentElement).toHaveAttribute("inert");
  app.rerender(view(true));
  expect(screen.getByTestId("document")).toBe(document);
  expect(document.parentElement).toHaveStyle({ visibility: "visible" });
});

it("removes hidden viewer toolbar commands and restores them without reopening the document", () => {
  const opened = vi.fn();
  const closed = vi.fn();
  const command = vi.fn();
  const buttons = [
    { id: "pdf-print", ariaLabel: "Print PDF", onClick: command },
  ];
  function Document() {
    useWorkbenchBarButtons(buttons);
    useEffect(() => {
      opened();
      return closed;
    }, []);
    return <div>PDF</div>;
  }
  function Toolbar() {
    const { buttons, actions } = useWorkbenchBar();
    return buttons.map((button) => (
      <button key={button.id} onClick={actions[button.id]}>
        {button.ariaLabel}
      </button>
    ));
  }
  const view = (active: boolean) => (
    <WorkbenchBarProvider>
      <Toolbar />
      <RetainedView active={active}>
        <Document />
      </RetainedView>
    </WorkbenchBarProvider>
  );
  const app = render(view(true));
  fireEvent.click(screen.getByRole("button", { name: "Print PDF" }));
  app.rerender(view(false));
  expect(screen.queryByRole("button", { name: "Print PDF" })).toBeNull();
  app.rerender(view(true));
  fireEvent.click(screen.getByRole("button", { name: "Print PDF" }));
  expect(command).toHaveBeenCalledTimes(2);
  expect(opened).toHaveBeenCalledTimes(1);
  expect(closed).not.toHaveBeenCalled();
  app.unmount();
  expect(closed).toHaveBeenCalledTimes(1);
});
