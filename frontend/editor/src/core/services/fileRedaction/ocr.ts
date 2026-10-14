import type { Page, Worker } from "tesseract.js";
import type {
  RedactionPage,
  RedactionProgress,
} from "@app/types/fileRedaction";
import { refineOcrLine } from "@app/services/fileRedaction/ocrGeometry";

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Cancelled", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

function smallTextScale(data: Page, canvas: HTMLCanvasElement): number {
  const heights = (data.blocks ?? [])
    .flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.flatMap((line) =>
          line.words.flatMap((word) =>
            word.symbols
              .filter((symbol) => /\p{L}/u.test(symbol.text))
              .map((symbol) => symbol.bbox.y1 - symbol.bbox.y0),
          ),
        ),
      ),
    )
    .filter((height) => height > 0)
    .sort((a, b) => a - b);
  const height = heights[Math.floor(heights.length / 2)];
  const requested =
    height && height < 24
      ? Math.min(3, Math.ceil(28 / height))
      : !data.text.trim()
        ? 2
        : 1;
  return Math.min(
    requested,
    3200 / Math.max(canvas.width, canvas.height),
    Math.sqrt(8_000_000 / (canvas.width * canvas.height)),
  );
}

export class LocalRedactionOcr {
  private workers = new Map<string, Worker>();
  private pending = new Map<string, Promise<Worker>>();
  private progress?: (fraction: number) => void;
  private stopped = false;

  private async workerFor(
    language: "chi_sim" | "eng",
    signal: AbortSignal,
  ): Promise<Worker> {
    let pending = this.pending.get(language);
    if (!pending) {
      const { createWorker, OEM } = await import("tesseract.js");
      throwIfAborted(signal);
      const base = new URL("vendor/redaction-ocr/", document.baseURI).href;
      pending = createWorker(language, OEM.LSTM_ONLY, {
        workerPath: `${base}worker.min.js`,
        corePath: `${base}core`,
        langPath: `${base}lang`,
        gzip: false,
        workerBlobURL: false,
        cacheMethod: "write",
        logger: (event) => {
          if (event.status === "recognizing text")
            this.progress?.(event.progress);
        },
      }).then(async (worker) => {
        if (this.stopped) {
          await worker.terminate();
          throw new DOMException("Cancelled", "AbortError");
        }
        this.workers.set(language, worker);
        return worker;
      });
      this.pending.set(language, pending);
    }
    return abortable(pending, signal);
  }

  async recognize(
    canvas: HTMLCanvasElement,
    signal: AbortSignal,
    onProgress?: (fraction: number) => void,
  ): Promise<Pick<RedactionPage, "text" | "spans">> {
    throwIfAborted(signal);
    this.progress = onProgress;
    const stop = () => {
      void this.dispose();
    };
    signal.addEventListener("abort", stop, { once: true });
    let enlarged: HTMLCanvasElement | undefined;
    try {
      // English recognition can turn Chinese names into Latin letters when both compete.
      const worker = await this.workerFor("chi_sim", signal);
      throwIfAborted(signal);
      let { data } = await abortable(
        worker.recognize(canvas, {}, { blocks: true }),
        signal,
      );
      let recognitionCanvas = canvas;
      let retryCanvas = canvas;
      const scale = smallTextScale(data, canvas);
      if (scale >= 1.25) {
        enlarged = document.createElement("canvas");
        enlarged.width = Math.round(canvas.width * scale);
        enlarged.height = Math.round(canvas.height * scale);
        const context = enlarged.getContext("2d");
        if (context) {
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
          retryCanvas = enlarged;
          const retry = await abortable(
            worker.recognize(enlarged, {}, { blocks: true }),
            signal,
          );
          // Keep the original pass if a different segmentation loses text or lowers confidence.
          if (
            retry.data.text.replace(/\s/g, "").length >=
              data.text.replace(/\s/g, "").length * 0.9 &&
            retry.data.text.trim() &&
            (!data.text.trim() || retry.data.confidence > data.confidence)
          ) {
            data = retry.data;
            recognitionCanvas = enlarged;
          }
        }
      }
      if (!data.text.trim()) {
        const { PSM } = await import("tesseract.js");
        await abortable(
          worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT }),
          signal,
        );
        try {
          const retry = await abortable(
            worker.recognize(retryCanvas, {}, { blocks: true }),
            signal,
          );
          if (retry.data.text.trim()) {
            data = retry.data;
            recognitionCanvas = retryCanvas;
          }
        } finally {
          if (!signal.aborted)
            await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
        }
      }
      if (
        !/\p{Script=Han}/u.test(data.text) &&
        (data.text.match(/[a-z]/gi)?.length ?? 0) >= 4
      ) {
        const english = await this.workerFor("eng", signal);
        const fallback = await abortable(
          english.recognize(recognitionCanvas, {}, { blocks: true }),
          signal,
        );
        if (
          fallback.data.text.trim() &&
          fallback.data.confidence > data.confidence
        )
          data = fallback.data;
      }
      throwIfAborted(signal);
      let text = "";
      const spans: RedactionPage["spans"] = [];
      for (const block of data.blocks ?? [])
        for (const paragraph of block.paragraphs)
          for (const line of paragraph.lines) {
            const lineSpans: RedactionPage["spans"] = [];
            for (const word of line.words) {
              const symbols = word.symbols.length
                ? word.symbols
                : [
                    {
                      text: word.text,
                      bbox: word.bbox,
                      confidence: word.confidence,
                    },
                  ];
              for (const symbol of symbols) {
                const start = text.length;
                text += symbol.text;
                lineSpans.push({
                  start,
                  end: text.length,
                  confidence: symbol.confidence,
                  rect: {
                    x: symbol.bbox.x0,
                    y: symbol.bbox.y0,
                    width: symbol.bbox.x1 - symbol.bbox.x0,
                    height: symbol.bbox.y1 - symbol.bbox.y0,
                  },
                });
              }
              const next = line.words[line.words.indexOf(word) + 1];
              if (
                next &&
                !/[\p{Script=Han}]$/u.test(word.text) &&
                !/^[\p{Script=Han}]/u.test(next.text)
              )
                text += " ";
            }
            spans.push(
              ...refineOcrLine(recognitionCanvas, line.bbox, text, lineSpans),
            );
            text += "\n";
          }
      if (!text && data.text.trim())
        throw new Error("OCR_COORDINATES_UNAVAILABLE");
      const scaleX = canvas.width / recognitionCanvas.width;
      const scaleY = canvas.height / recognitionCanvas.height;
      return {
        text,
        spans: spans.map((span) => ({
          ...span,
          rect: span.rect
            ? {
                x: span.rect.x * scaleX,
                y: span.rect.y * scaleY,
                width: span.rect.width * scaleX,
                height: span.rect.height * scaleY,
              }
            : undefined,
        })),
      };
    } finally {
      if (enlarged) enlarged.width = enlarged.height = 0;
      signal.removeEventListener("abort", stop);
      this.progress = undefined;
    }
  }

  async dispose(): Promise<void> {
    this.stopped = true;
    const workers = [...this.workers.values()];
    this.workers.clear();
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

export type ProgressCallback = (progress: RedactionProgress) => void;
