import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FileRedactionLayer from "@app/components/tools/redact/FileRedactionLayer";

const session = vi.hoisted(() => ({
  documents: [{ id: "pdf-a", pages: [{ index: 1, width: 100, height: 200 }] }],
  activeDocumentId: "pdf-a" as string | null,
  hits: [
    {
      id: "hit",
      documentId: "pdf-a",
      pageIndex: 1,
      original: "secret",
      selected: true,
      rects: [{ x: 10, y: 20, width: 30, height: 10 }],
    },
  ],
  preview: false,
  drawing: false,
  busy: false,
  focusHitId: null,
  replacements: new Map(),
  settings: { method: "blackout" },
  addRegion: vi.fn(),
  focusHit: vi.fn(),
  changeHits: vi.fn(),
}));
vi.mock("@app/contexts/FileRedactionContext", () => ({
  useFileRedaction: () => session,
}));
vi.mock("@app/services/fileRedaction/documents", () => ({
  paintRedactions: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  session.activeDocumentId = "pdf-a";
  session.drawing = false;
  session.busy = false;
  session.preview = false;
  session.hits[0].selected = true;
});
describe("native reader redaction layer", () => {
  it("keeps the painted preview clickable so a masked hit can be excluded", () => {
    session.preview = true;
    render(
      <FileRedactionLayer
        fileId="pdf-a"
        pageIndex={1}
        width={200}
        height={400}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "secret", pressed: true }),
    );
    expect(session.changeHits).toHaveBeenCalledExactlyOnceWith(["hit"], {
      selected: false,
    });
  });
  it("toggles a marker off and back on and prevents changes while busy", () => {
    const view = () => (
      <FileRedactionLayer
        fileId="pdf-a"
        pageIndex={1}
        width={200}
        height={400}
      />
    );
    const { rerender } = render(view());
    fireEvent.click(
      screen.getByRole("button", { name: "secret", pressed: true }),
    );
    expect(session.changeHits).toHaveBeenLastCalledWith(["hit"], {
      selected: false,
    });
    session.hits[0].selected = false;
    rerender(view());
    fireEvent.click(
      screen.getByRole("button", { name: "secret", pressed: false }),
    );
    expect(session.changeHits).toHaveBeenLastCalledWith(["hit"], {
      selected: true,
    });
    session.busy = true;
    rerender(view());
    expect(screen.getByRole("button", { name: "secret" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "secret" }));
    expect(session.changeHits).toHaveBeenCalledTimes(2);
  });
  it("never shows markers from the previously analysed file on another PDF", () => {
    const { rerender } = render(
      <FileRedactionLayer
        fileId="pdf-a"
        pageIndex={1}
        width={200}
        height={400}
      />,
    );
    expect(screen.getByRole("button", { name: "secret" }).style.left).toBe(
      "10%",
    );
    rerender(
      <FileRedactionLayer
        fileId="pdf-b"
        pageIndex={1}
        width={200}
        height={400}
      />,
    );
    expect(screen.queryByRole("button", { name: "secret" })).toBeNull();
  });
  it("uses the visible page and zoom when drawing rather than a detached page selector", () => {
    session.drawing = true;
    const { container } = render(
      <FileRedactionLayer
        fileId="pdf-a"
        pageIndex={1}
        width={200}
        height={400}
      />,
    );
    const layer = container.firstElementChild as HTMLElement;
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      left: 20,
      top: 30,
      width: 200,
      height: 400,
    } as DOMRect);
    layer.setPointerCapture = vi.fn();
    fireEvent.pointerDown(layer, {
      button: 0,
      pointerId: 1,
      clientX: 40,
      clientY: 70,
    });
    fireEvent.pointerUp(layer, { pointerId: 1, clientX: 100, clientY: 130 });
    expect(session.addRegion).toHaveBeenCalledWith(
      { x: 10, y: 20, width: 30, height: 30 },
      1,
    );
  });
});
