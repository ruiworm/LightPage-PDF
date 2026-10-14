import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  WorkbenchBarProvider,
  useWorkbenchBar,
  useWorkbenchBarActions,
} from "@app/contexts/WorkbenchBarContext";

it("updates the toolbar without rerendering document registration consumers", () => {
  const documentRender = vi.fn();
  let toolbar: ReturnType<typeof useWorkbenchBar>;
  function Document() {
    documentRender(useWorkbenchBarActions());
    return null;
  }
  function Toolbar() {
    toolbar = useWorkbenchBar();
    return null;
  }
  render(
    <WorkbenchBarProvider>
      <Document />
      <Toolbar />
    </WorkbenchBarProvider>,
  );
  act(() => toolbar.registerButtons([{ id: "rotate", ariaLabel: "Rotate" }]));
  act(() => toolbar.setAction("rotate", () => {}));
  act(() => toolbar.setAllButtonsDisabled(true));
  expect(toolbar.buttons.map((button) => button.id)).toEqual(["rotate"]);
  expect(toolbar.allButtonsDisabled).toBe(true);
  expect(documentRender).toHaveBeenCalledTimes(1);
  act(() => toolbar.unregisterButtons(["rotate"]));
  expect(toolbar.buttons).toEqual([]);
  expect(documentRender).toHaveBeenCalledTimes(1);
});
