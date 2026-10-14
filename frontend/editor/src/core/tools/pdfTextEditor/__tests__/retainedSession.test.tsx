import type { ReactNode } from "react";
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RetainedView } from "@app/components/layout/RetainedView";
import {
  useEditorStore,
  __resetEditorStoreForTests,
} from "@app/tools/pdfTextEditor/hooks/useEditorStore";
import { useEditorKeyboardShortcuts } from "@app/tools/pdfTextEditor/hooks/useEditorKeyboardShortcuts";

const lifetime = vi.hoisted(() => ({
  clear: vi.fn(),
  dispose: vi.fn(),
  snapshot: { pageCount: 2 },
}));
vi.mock("@app/tools/pdfTextEditor/store/EditorStore", () => ({
  EditorStore: class {
    getState() {
      return lifetime.snapshot;
    }
    subscribe() {
      return () => {};
    }
    clearDocument = lifetime.clear;
    dispose = lifetime.dispose;
  },
}));

afterEach(() => {
  __resetEditorStoreForTests();
  vi.useRealTimers();
  vi.clearAllMocks();
  lifetime.snapshot = { pageCount: 2 };
});

it("reads current pages when a retained canvas returns after a file replacement", () => {
  const canvas = renderHook(() => useEditorStore());
  expect(canvas.result.current.state.pageCount).toBe(2);
  // Simulate replacement in the render/subscription gap: the snapshot changed
  // before a listener could publish it into component-local state.
  lifetime.snapshot = { pageCount: 1 };
  canvas.rerender();
  expect(canvas.result.current.state.pageCount).toBe(1);
  canvas.unmount();
});

it("keeps PDFium alive until both the canvas and controller release it", () => {
  vi.useFakeTimers();
  const controller = renderHook(() => useEditorStore());
  const canvas = renderHook(() => useEditorStore());
  expect(canvas.result.current.store).toBe(controller.result.current.store);
  canvas.unmount();
  act(() => vi.advanceTimersByTime(2000));
  expect(lifetime.clear).not.toHaveBeenCalled();
  controller.unmount();
  act(() => vi.advanceTimersByTime(2000));
  expect(lifetime.clear).toHaveBeenCalledTimes(1);
});

it("does not steal Save while its retained editor is hidden", () => {
  let active = true;
  const save = vi.fn();
  const noOp = () => {};
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RetainedView active={active}>{children}</RetainedView>
  );
  const hook = renderHook(
    () => {
      const { store } = useEditorStore();
      useEditorKeyboardShortcuts({
        store,
        onSave: save,
        onUndo: noOp,
        onRedo: noOp,
        onDelete: noOp,
        onDuplicate: noOp,
        onSelectAll: noOp,
        onToggleHelp: noOp,
        onOpenFind: noOp,
        onFindNext: noOp,
        onEscape: noOp,
        onMergeSelection: noOp,
      });
    },
    { wrapper },
  );
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  expect(save).toHaveBeenCalledTimes(1);
  active = false;
  hook.rerender();
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  expect(save).toHaveBeenCalledTimes(1);
  active = true;
  hook.rerender();
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  expect(save).toHaveBeenCalledTimes(2);
  hook.unmount();
});
