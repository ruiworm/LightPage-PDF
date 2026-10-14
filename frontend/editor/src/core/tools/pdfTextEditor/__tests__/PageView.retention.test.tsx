import { MantineProvider } from "@mantine/core";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetainedView } from "@app/components/layout/RetainedView";
import { PageView } from "@app/tools/pdfTextEditor/components/PageView";
import { DisplayTransform } from "@app/tools/pdfTextEditor/model/DisplayTransform";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/types";

const renderer = vi.hoisted(() => vi.fn());
vi.mock("@app/tools/pdfTextEditor/pdfium/PdfiumPageRenderer", () => ({
  PdfiumPageRenderer: {
    render: renderer,
    rasterSize: (width: number, height: number, scale: number) => ({
      width: width * scale,
      height: height * scale,
    }),
    deviceScale: (_width: number, _height: number, scale: number) => scale,
  },
}));

const observers: FakeObserver[] = [];
class FakeObserver {
  target?: Element;
  disconnect = vi.fn();
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit,
  ) {
    observers.push(this);
  }
  observe(target: Element) {
    this.target = target;
  }
  emit(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting, target: this.target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
const image = { width: 100, height: 140 } as ImageData;
const noOp = () => {};
const page: PageSnapshot = {
  pageIndex: 0,
  width: 100,
  height: 140,
  revision: 1,
  runs: [],
  images: [],
  shapes: [],
  display: DisplayTransform.identity(100, 140),
};
const source = {
  disposed: false,
  page: () => page,
} as unknown as EditorDocument;

function view(active: boolean, snapshot = page, scale = 1, document = source) {
  return (
    <MantineProvider>
      <RetainedView active={active}>
        <PageView
          document={document}
          page={snapshot}
          scale={scale}
          widthMode="grow"
          selectedRunIds={[]}
          selectedImageIds={[]}
          selectedShapeIds={[]}
          onSelectRun={noOp}
          onSelectImage={noOp}
          onSelectShape={noOp}
          onEditRun={noOp}
        />
      </RetainedView>
    </MantineProvider>
  );
}
function near() {
  return observers
    .filter((observer) => observer.options.rootMargin === "800px")
    .at(-1)!;
}
async function paint() {
  act(() => near().emit(true));
  await waitFor(() =>
    expect(document.querySelector("canvas")!.width).toBe(100),
  );
}

beforeEach(() => {
  observers.length = 0;
  renderer.mockReset().mockResolvedValue(image);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.spyOn(window, "matchMedia").mockImplementation((media) => ({
    matches: false,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("retained editor page bitmaps", () => {
  it("keeps the bitmap across view switches and ignores hidden observer callbacks", async () => {
    const mounted = render(view(true));
    await paint();
    const canvas = document.querySelector("canvas")!;
    const observer = near();
    mounted.rerender(view(false));
    act(() => observer.emit(false));
    expect(canvas.width).toBe(100);
    mounted.rerender(view(true));
    act(() => near().emit(true));
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(100);
    mounted.unmount();
    expect(canvas.width).toBe(0);
  });
  it("still releases an offscreen bitmap while the editor is active", async () => {
    render(view(true));
    await paint();
    act(() => near().emit(false));
    expect(document.querySelector("canvas")!.width).toBe(0);
    await paint();
    expect(renderer).toHaveBeenCalledTimes(2);
  });
  it.each(["revision", "zoom", "document"])(
    "refreshes a changed %s when the view returns",
    async (change) => {
      const mounted = render(view(true));
      await paint();
      const snapshot = change === "revision" ? { ...page, revision: 2 } : page;
      const scale = change === "zoom" ? 2 : 1;
      const nextSource =
        change === "document" ? ({ ...source } as EditorDocument) : source;
      mounted.rerender(view(false, snapshot, scale, nextSource));
      expect(renderer).toHaveBeenCalledTimes(1);
      mounted.rerender(view(true, snapshot, scale, nextSource));
      await waitFor(() => expect(renderer).toHaveBeenCalledTimes(2));
    },
  );
  it("ignores an in-flight old render after hiding and completes a fresh render on return", async () => {
    let finish!: (image: ImageData) => void;
    renderer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const mounted = render(view(true));
    act(() => near().emit(true));
    mounted.rerender(view(false));
    await act(async () => {
      finish(image);
    });
    expect(document.querySelector("canvas")!.width).toBe(0);
    mounted.rerender(view(true));
    await waitFor(() =>
      expect(document.querySelector("canvas")!.width).toBe(100),
    );
    expect(renderer).toHaveBeenCalledTimes(2);
  });
});
