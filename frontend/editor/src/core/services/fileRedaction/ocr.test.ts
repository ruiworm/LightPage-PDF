import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRedactionOcr } from "@app/services/fileRedaction/ocr";

const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
  recognize: vi.fn(),
  terminate: vi.fn(),
  setParameters: vi.fn(),
}));
vi.mock("tesseract.js", () => ({
  createWorker: mocks.createWorker,
  OEM: { LSTM_ONLY: 1 },
  PSM: { AUTO: "3", SPARSE_TEXT: "11" },
}));
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  mocks.setParameters.mockResolvedValue({});
});
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

function recognition(text: string, confidence: number, scale = 1) {
  return {
    data: {
      text,
      confidence,
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    {
                      text,
                      symbols: Array.from(text).map((value, index) => ({
                        text: value,
                        confidence,
                        bbox: {
                          x0: (20 + index * 12) * scale,
                          y0: 30 * scale,
                          x1: (30 + index * 12) * scale,
                          y1: 42 * scale,
                        },
                      })),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe("local redaction OCR", () => {
  it("retries small Chinese text and maps enlarged coordinates back to the source", async () => {
    const context = { drawImage: vi.fn() };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
    });
    mocks.recognize
      .mockResolvedValueOnce(recognition("程沐河", 70))
      .mockResolvedValueOnce(recognition("程沐澄", 94, 3));
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 420;
    const ocr = new LocalRedactionOcr();
    const result = await ocr.recognize(canvas, new AbortController().signal);
    expect(result.text).toBe("程沐澄\n");
    expect(result.spans[2].rect).toEqual({
      x: 44,
      y: 30,
      width: 10,
      height: 12,
    });
    expect(context.drawImage).toHaveBeenCalledWith(canvas, 0, 0, 1920, 1260);
    expect(canvas.width).toBe(640);
    expect(mocks.recognize.mock.calls[1][0].width).toBe(0);
    await ocr.dispose();
  });
  it("keeps the first pass when a retry drops text", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
    });
    mocks.recognize
      .mockResolvedValueOnce(recognition("程沐澄", 80))
      .mockResolvedValueOnce(recognition("澄", 99, 3));
    const ocr = new LocalRedactionOcr();
    const result = await ocr.recognize(
      document.createElement("canvas"),
      new AbortController().signal,
    );
    expect(result.text).toBe("程沐澄\n");
    expect(result.spans[0].rect?.x).toBe(20);
    await ocr.dispose();
  });
  it("does not allocate an enlarged raster beyond the pixel budget", async () => {
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
    });
    mocks.recognize.mockResolvedValue(recognition("程沐澄", 80));
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 3000;
    const ocr = new LocalRedactionOcr();
    await ocr.recognize(canvas, new AbortController().signal);
    expect(mocks.recognize).toHaveBeenCalledOnce();
    await ocr.dispose();
  });
  it("recovers an empty page with sparse segmentation and restores automatic segmentation", async () => {
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
      setParameters: mocks.setParameters,
    });
    mocks.recognize
      .mockResolvedValueOnce({ data: { text: "", blocks: [], confidence: 0 } })
      .mockResolvedValueOnce(recognition("陈宁", 90));
    const ocr = new LocalRedactionOcr();
    const result = await ocr.recognize(
      document.createElement("canvas"),
      new AbortController().signal,
    );
    expect(result.text).toBe("陈宁\n");
    expect(
      mocks.setParameters.mock.calls.map(
        (call) => call[0].tessedit_pageseg_mode,
      ),
    ).toEqual(["11", "3"]);
    expect(mocks.recognize.mock.calls[1][0]).toBe(
      mocks.recognize.mock.calls[0][0],
    );
    await ocr.dispose();
  });
  it("loads only bundled local assets and retains exact symbol coordinates", async () => {
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
    });
    mocks.recognize.mockResolvedValue({
      data: {
        text: "张三",
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [
                      {
                        text: "张三",
                        symbols: [
                          {
                            text: "张",
                            confidence: 99,
                            bbox: { x0: 10, y0: 10, x1: 20, y1: 30 },
                          },
                          {
                            text: "三",
                            confidence: 60,
                            bbox: { x0: 20, y0: 10, x1: 30, y1: 30 },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const ocr = new LocalRedactionOcr();
    const result = await ocr.recognize(
      document.createElement("canvas"),
      new AbortController().signal,
    );
    expect(result.text).toBe("张三\n");
    expect(result.spans[1]).toEqual({
      start: 1,
      end: 2,
      confidence: 60,
      rect: { x: 20, y: 10, width: 10, height: 20 },
    });
    const options = mocks.createWorker.mock.calls[0][2];
    expect(mocks.createWorker.mock.calls[0][0]).toBe("chi_sim");
    expect(new URL(options.workerPath).origin).toBe(location.origin);
    expect(options.workerPath).toContain("vendor/redaction-ocr/worker.min.js");
    expect(options.corePath).toContain("vendor/redaction-ocr/core");
    expect(options.langPath).toContain("vendor/redaction-ocr/lang");
    await ocr.dispose();
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });
  it("retries English-only text locally and releases both language workers", async () => {
    const line = (text: string, confidence: number) => ({
      data: {
        text,
        confidence,
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [
                      {
                        text,
                        symbols: [],
                        confidence,
                        bbox: { x0: 10, y0: 10, x1: 80, y1: 30 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
    });
    mocks.recognize
      .mockResolvedValueOnce(line("Alexancler", 58))
      .mockResolvedValueOnce(line("Alexander", 97));
    const ocr = new LocalRedactionOcr();
    const result = await ocr.recognize(
      document.createElement("canvas"),
      new AbortController().signal,
    );
    expect(mocks.createWorker.mock.calls.map((call) => call[0])).toEqual([
      "chi_sim",
      "eng",
    ]);
    expect(result.text).toBe("Alexander\n");
    await ocr.dispose();
    expect(mocks.terminate).toHaveBeenCalledTimes(2);
  });
  it("cancels recognition even if a terminated worker never resolves its job", async () => {
    const controller = new AbortController();
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
    });
    mocks.recognize.mockImplementation(() => new Promise(() => {}));
    const ocr = new LocalRedactionOcr();
    const result = ocr.recognize(
      document.createElement("canvas"),
      controller.signal,
    );
    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });
  it("terminates a worker that finishes initialization after cancellation", async () => {
    const controller = new AbortController();
    let finish!: (worker: unknown) => void;
    mocks.createWorker.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const ocr = new LocalRedactionOcr();
    const result = ocr.recognize(
      document.createElement("canvas"),
      controller.signal,
    );
    await vi.waitFor(() => expect(mocks.createWorker).toHaveBeenCalled());
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    finish({ recognize: mocks.recognize, terminate: mocks.terminate });
    await vi.waitFor(() => expect(mocks.terminate).toHaveBeenCalledOnce());
    expect(mocks.recognize).not.toHaveBeenCalled();
  });
});
