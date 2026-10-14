import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFileColorMap } from "@app/components/pageEditor/hooks/useFileColorMap";
import type { FileId } from "@app/types/file";

const ids = (...values: string[]) => values as FileId[];

describe("file colors", () => {
  it("keeps a file's color when its pages or source order change", () => {
    const view = renderHook(({ files }) => useFileColorMap(files), {
      initialProps: { files: ids("A", "B", "C") },
    });
    const originalColors = new Map(view.result.current);

    act(() => view.rerender({ files: ids("C", "A", "B") }));

    expect(view.result.current).toEqual(originalColors);
  });

  it("reuses a removed file's color without duplicating a remaining color", () => {
    const view = renderHook(({ files }) => useFileColorMap(files), {
      initialProps: { files: ids("A", "B", "C") },
    });
    const colorB = view.result.current.get("B" as FileId);
    const colorC = view.result.current.get("C" as FileId);

    act(() => view.rerender({ files: ids("B", "C", "D", "E") }));

    const colors = view.result.current;
    expect(colors.get("B" as FileId)).toBe(colorB);
    expect(colors.get("C" as FileId)).toBe(colorC);
    expect(new Set(colors.values()).size).toBe(4);
    expect(colors.has("A" as FileId)).toBe(false);
  });

  it("publishes a new color map when the selection changes", () => {
    const view = renderHook(({ files }) => useFileColorMap(files), {
      initialProps: { files: ids("A", "B") },
    });
    const previous = view.result.current;

    act(() => view.rerender({ files: ids("B") }));

    expect(view.result.current).not.toBe(previous);
    expect(previous.size).toBe(2);
    expect(view.result.current.size).toBe(1);
  });
});
