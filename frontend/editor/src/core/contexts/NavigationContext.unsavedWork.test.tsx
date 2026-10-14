import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

vi.mock("@app/contexts/ToolRegistryContext", () => ({
  useToolRegistry: () => ({ allTools: {} }),
}));

import {
  NavigationProvider,
  useNavigation,
  useNavigationActions,
  useSelectedTool,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { hasUnsavedWork, __resetUnsavedWork } from "@app/services/unsavedWork";

// The bug this pins: every editor marks itself dirty on NavigationContext, while
// the disk reconciliation read FileContext's own flag - which nothing sets. An
// external edit therefore replaced the bytes under an open editor with no prompt.

let editor: ReturnType<typeof useNavigation>;

function OpenEditor() {
  editor = useNavigation();
  return null;
}

function renderEditor() {
  return render(
    <NavigationProvider>
      <OpenEditor />
    </NavigationProvider>,
  );
}

beforeEach(() => {
  __resetUnsavedWork();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("retired workspace overview routes", () => {
  it("restores the reader for a legacy workspace overview session", () => {
    renderEditor();
    act(() => editor.restoreWorkbench("fileEditor"));
    expect(editor.workbench).toBe("viewer");
  });

  it("opens a legacy tool destination in the reader", () => {
    renderEditor();
    act(() => editor.setToolAndWorkbench("merge", "fileEditor"));
    expect(editor.workbench).toBe("viewer");
    expect(editor.selectedTool).toBe("merge");
  });

  it("still guards leaving unsaved page edits for a legacy destination", () => {
    renderEditor();
    act(() => editor.setWorkbench("pageEditor"));
    act(() => editor.setHasUnsavedChanges(true));
    act(() => editor.setWorkbench("fileEditor"));
    expect(editor.workbench).toBe("pageEditor");
    expect(editor.pendingNavigation).not.toBeNull();
    act(() => editor.confirmNavigation());
    expect(editor.workbench).toBe("viewer");
  });
});
afterEach(() => vi.restoreAllMocks());

describe("the dirty state the disk reconciliation reads", () => {
  it("is clean while no editor has touched anything", () => {
    renderEditor();
    expect(hasUnsavedWork()).toBe(false);
  });

  it("reports edits an editor made but no version has captured", () => {
    renderEditor();
    act(() => editor.setHasUnsavedChanges(true));
    expect(hasUnsavedWork()).toBe(true);
  });

  it("reports edits held only by a registered checker", () => {
    // How PageEditor and FormFill answer: their dirty state lives in their own
    // undo stack, and never reaches the reducer until navigation asks.
    renderEditor();
    act(() => editor.registerUnsavedChangesChecker(() => true));
    expect(hasUnsavedWork()).toBe(true);
  });

  it("is clean again once the editor commits or closes", () => {
    renderEditor();
    act(() => editor.setHasUnsavedChanges(true));
    act(() => editor.setHasUnsavedChanges(false));
    expect(hasUnsavedWork()).toBe(false);
  });

  it("is clean once the provider unmounts", () => {
    const view = renderEditor();
    act(() => editor.setHasUnsavedChanges(true));
    view.unmount();
    expect(hasUnsavedWork()).toBe(false);
  });
});

describe("warm navigation subscriptions", () => {
  it("keeps action-only and tool-only consumers out of unrelated updates", () => {
    const actionsRender = vi.fn();
    const toolRender = vi.fn();
    const guardRender = vi.fn();
    function Actions() {
      actionsRender(useNavigationActions());
      return null;
    }
    function Tool() {
      toolRender(useSelectedTool());
      return null;
    }
    function Guard() {
      guardRender(useNavigationGuard());
      return null;
    }
    render(
      <NavigationProvider>
        <OpenEditor />
        <Actions />
        <Tool />
        <Guard />
      </NavigationProvider>,
    );
    const actions = editor;
    act(() => editor.setWorkbench("pageEditor"));
    expect(guardRender).toHaveBeenCalledTimes(1);
    act(() => editor.setHasUnsavedChanges(true));
    act(() => editor.setHasUnsavedChanges(true));
    expect(actionsRender).toHaveBeenCalledTimes(1);
    expect(toolRender).toHaveBeenCalledTimes(1);
    expect(guardRender).toHaveBeenCalledTimes(2);
    // A callback obtained before the edit must still guard the current dirty state.
    act(() =>
      actions.setToolAndWorkbench("pdfTextEditor", "custom:pdfTextEditor"),
    );
    expect(editor.workbench).toBe("pageEditor");
    expect(editor.pendingNavigation).not.toBeNull();
    act(() => actions.confirmNavigation());
    expect(editor.workbench).toBe("custom:pdfTextEditor");
    expect(editor.selectedTool).toBe("pdfTextEditor");
    expect(actionsRender).toHaveBeenCalledTimes(1);
    expect(toolRender).toHaveBeenCalledTimes(2);
  });

  it("does not republish unchanged state on repeated cleanup notifications", () => {
    const published = vi.fn();
    function Observer() {
      published(useNavigation());
      return null;
    }
    render(
      <NavigationProvider>
        <OpenEditor />
        <Observer />
      </NavigationProvider>,
    );
    const initialRenders = published.mock.calls.length;
    act(() => editor.restoreWorkbench(editor.workbench));
    act(() => editor.setHasUnsavedChanges(false));
    act(() => editor.showNavigationWarning(false));
    act(() => editor.cancelNavigation());
    expect(published).toHaveBeenCalledTimes(initialRenders);
  });
});
