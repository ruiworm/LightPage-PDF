import { expect, it } from "vitest";
import {
  cacheWordPreview,
  getWordPreview,
} from "@app/services/wordPreviewCache";

function preview() {
  return {
    kind: "doc" as const,
    pdf: new File([], "preview.pdf"),
    firstPage: { url: "data:fixture", count: 2 },
  };
}

it("keys a ready preview by immutable source identity rather than filename", () => {
  const original = new File(["before"], "same.doc");
  const value = preview();
  cacheWordPreview(original, value);
  expect(getWordPreview(original)).toBe(value);
  expect(getWordPreview(new File(["after"], "same.doc"))).toBeUndefined();
});

it("evicts the least recently used source after two ready previews", () => {
  const files = [0, 1, 2].map(
    (index) => new File([String(index)], `${index}.doc`),
  );
  cacheWordPreview(files[0], preview());
  cacheWordPreview(files[1], preview());
  getWordPreview(files[0]);
  cacheWordPreview(files[2], preview());
  expect(getWordPreview(files[1])).toBeUndefined();
  expect(getWordPreview(files[0])).toBeDefined();
  expect(getWordPreview(files[2])).toBeDefined();
});

it("bounds combined source and rendered-preview bytes", () => {
  const first = new Blob([new Uint8Array(8 * 1024 * 1024)]);
  const second = new Blob([new Uint8Array(8 * 1024 * 1024)]);
  cacheWordPreview(first, preview());
  cacheWordPreview(second, preview());
  expect(getWordPreview(first)).toBeUndefined();
  expect(getWordPreview(second)).toBeDefined();
});

it("does not retain an oversized conversion or disturb a smaller ready preview", () => {
  const small = new Blob(["small"]);
  cacheWordPreview(small, preview());
  const large = new Blob(["source"]);
  cacheWordPreview(large, {
    ...preview(),
    pdf: new File([new Uint8Array(16 * 1024 * 1024)], "large.pdf"),
  });
  expect(getWordPreview(large)).toBeUndefined();
  expect(getWordPreview(small)).toBeDefined();
});
