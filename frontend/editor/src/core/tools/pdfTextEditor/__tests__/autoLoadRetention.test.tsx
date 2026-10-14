import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RetainedView } from "@app/components/layout/RetainedView";
import {
  useAutoLoadFile,
  type EditorLoadState,
} from "@app/tools/pdfTextEditor/hooks/useAutoLoadFile";
import type { FileId } from "@app/types/file";

const file = (id: string, lastModified = 1) =>
  Object.assign(new File(["pdf"], `${id}.pdf`, { lastModified }), {
    fileId: id as FileId,
  });
const a = file("A");
const b = file("B");
const session = { active: true, reader: "A", files: [a, b], selection: [a] };
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files: session.files }),
  useFileSelection: () => ({ selectedFiles: session.selection }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ activeFileId: session.reader }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ selectedTool: "pdfTextEditor" }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <RetainedView active={session.active} mount>
    {children}
  </RetainedView>
);
beforeEach(() => {
  session.active = true;
  session.reader = "A";
  session.files = [a, b];
  session.selection = [a];
});

function setup() {
  const load = vi.fn();
  const chosen = vi.fn();
  const editor: EditorLoadState = {
    hasDocument: false,
    loading: false,
    error: null,
    dirty: false,
  };
  const view = renderHook(
    () => useAutoLoadFile(load, chosen, "A" as FileId, false, editor),
    { wrapper },
  );
  act(() => {
    editor.hasDocument = true;
    view.rerender();
  });
  return { ...view, load, chosen, editor };
}

it("does not reparse the same document across repeated tab switches", () => {
  const view = setup();
  for (let cycle = 0; cycle < 3; cycle++) {
    session.active = false;
    view.rerender();
    session.active = true;
    view.rerender();
  }
  expect(view.load).toHaveBeenCalledTimes(1);
});

it("follows a new reader document on return, without opening it in the background", () => {
  const view = setup();
  session.active = false;
  view.rerender();
  session.reader = "B";
  view.rerender();
  expect(view.load).toHaveBeenCalledTimes(1);
  session.active = true;
  view.rerender();
  expect(view.load).toHaveBeenLastCalledWith(b);
  expect(view.chosen).toHaveBeenLastCalledWith("B.pdf", "B");
});

it("does not replace unsaved edits with a different reader document", () => {
  const view = setup();
  view.editor.dirty = true;
  session.active = false;
  view.rerender();
  session.reader = "B";
  session.active = true;
  view.rerender();
  expect(view.load).toHaveBeenCalledTimes(1);
});

it("reloads changed file bytes even when their file id stays the same", () => {
  const view = setup();
  const replacement = file("A", 99);
  session.files = [replacement, b];
  session.selection = [replacement];
  view.rerender();
  expect(view.load).toHaveBeenLastCalledWith(replacement);
  expect(view.load).toHaveBeenCalledTimes(2);
});
