import { describe, it, expect, vi, beforeEach } from "vitest";

const capture = vi.fn();
let optedIn = true;

vi.mock("posthog-js", () => ({
  default: {
    __loaded: true,
    has_opted_in_capturing: () => optedIn,
    capture: (...args: unknown[]) => capture(...args),
  },
}));

import {
  trackPdfUploaded,
  trackEditorOperation,
} from "@app/services/analytics";

function pdf(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("analytics", () => {
  beforeEach(() => {
    capture.mockClear();
    optedIn = true;
  });

  it("does not capture uploads even when consent was granted", () => {
    trackPdfUploaded([pdf("a.pdf"), pdf("a.pdf"), pdf("b.pdf")]);
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not capture other uploaded file types", () => {
    trackPdfUploaded([
      new File(["x"], "a.png", { type: "image/png" }),
      pdf("b.pdf"),
    ]);
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not capture editor operations", () => {
    trackEditorOperation("compress", 3);
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not capture when opted out", () => {
    optedIn = false;
    trackPdfUploaded([pdf("a.pdf")]);
    trackEditorOperation("compress", 1);
    expect(capture).not.toHaveBeenCalled();
  });
});
