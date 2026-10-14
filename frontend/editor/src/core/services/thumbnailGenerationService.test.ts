import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbnailGenerationService } from "@app/services/thumbnailGenerationService";
import type { FileId } from "@app/types/file";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  render: vi.fn(),
}));

vi.mock("@app/services/pdfiumService", () => ({
  openRawDocumentSafe: mocks.open,
  closeRawDocument: mocks.close,
}));
vi.mock("@app/utils/pdfiumPageRender", () => ({
  renderPdfiumPageDataUrl: mocks.render,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const services: ThumbnailGenerationService[] = [];
const fileId = (id: string) => id as FileId;
const bytes = () => new ArrayBuffer(8);
function service(count = 3, byteLimit = 64 * 1024 * 1024, idleMs = 30_000) {
  const value = new ThumbnailGenerationService(count, byteLimit, idleMs);
  services.push(value);
  return value;
}

beforeEach(() => {
  let nextPointer = 0;
  mocks.open.mockImplementation(async () => ++nextPointer);
  mocks.close.mockResolvedValue(undefined);
  mocks.render.mockImplementation(
    async (pointer: number, page: number) => `thumbnail:${pointer}:${page}`,
  );
});
afterEach(() => {
  services.splice(0).forEach((value) => value.destroy());
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("thumbnail document cache", () => {
  it("reuses one native document across successive uncached page batches", async () => {
    const cache = service();
    const source = bytes();
    const first = await cache.generateThumbnails(fileId("a"), source, [1, 2]);
    const second = await cache.generateThumbnails(fileId("a"), source, [3, 4]);

    expect(first.map((item) => item.thumbnail)).toEqual([
      "thumbnail:1:0",
      "thumbnail:1:1",
    ]);
    expect(second.map((item) => item.thumbnail)).toEqual([
      "thumbnail:1:2",
      "thumbnail:1:3",
    ]);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(mocks.close).not.toHaveBeenCalled();
    cache.destroy();
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("shares a pending open and keeps the native handle until all active renders release", async () => {
    const cache = service();
    const source = bytes();
    const opening = deferred<number>();
    const firstRender = deferred<string>();
    const secondRender = deferred<string>();
    mocks.open.mockReturnValueOnce(opening.promise);
    mocks.render
      .mockReturnValueOnce(firstRender.promise)
      .mockReturnValueOnce(secondRender.promise);
    const first = cache.generateThumbnails(fileId("a"), source, [1]);
    const second = cache.generateThumbnails(fileId("a"), source, [2]);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    opening.resolve(100);
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));

    cache.clearPDFCache();
    expect(mocks.close).not.toHaveBeenCalled();
    firstRender.resolve("first");
    await first;
    expect(mocks.close).not.toHaveBeenCalled();
    secondRender.resolve("second");
    await second;
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(100);
  });

  it("replaces changed bytes without closing a render of the old source", async () => {
    const cache = service();
    const original = bytes();
    const replacement = bytes();
    const oldRender = deferred<string>();
    mocks.render.mockReturnValueOnce(oldRender.promise);
    const old = cache.generateThumbnails(fileId("a"), original, [1]);
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    const fresh = await cache.generateThumbnails(fileId("a"), replacement, [1]);
    expect(fresh[0].thumbnail).toBe("thumbnail:2:0");
    expect(mocks.close).not.toHaveBeenCalled();

    oldRender.resolve("old");
    await old;
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
    await cache.generateThumbnails(fileId("a"), replacement, [2]);
    expect(mocks.open).toHaveBeenCalledTimes(2);
    cache.destroy();
    expect(mocks.close.mock.calls).toEqual([[1], [2]]);
  });

  it("clearing during an open cannot repopulate or release its newer replacement", async () => {
    const cache = service();
    const source = bytes();
    const opening = deferred<number>();
    mocks.open.mockReturnValueOnce(opening.promise);
    const stale = cache.generateThumbnails(fileId("a"), source, [1]);
    cache.clearPDFCacheForFile(fileId("a"));
    await cache.generateThumbnails(fileId("a"), source, [2]);
    opening.resolve(100);
    await stale;

    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(100);
    await cache.generateThumbnails(fileId("a"), source, [3]);
    expect(mocks.open).toHaveBeenCalledTimes(2);
    cache.destroy();
    expect(mocks.close.mock.calls).toEqual([[100], [1]]);
  });

  it("shares a failed open, drops it, and allows another attempt", async () => {
    const cache = service();
    const source = bytes();
    const opening = deferred<number>();
    mocks.open.mockReturnValueOnce(opening.promise);
    const first = cache.generateThumbnails(fileId("a"), source, [1]);
    const second = cache.generateThumbnails(fileId("a"), source, [2]);
    const settled = Promise.allSettled([first, second]);
    opening.reject(new Error("cannot open"));
    expect((await settled).map((item) => item.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledTimes(1);
    await cache.generateThumbnails(fileId("a"), source, [1]);
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it("releases a failed render and reopens the file on retry", async () => {
    const cache = service();
    const source = bytes();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.render.mockRejectedValueOnce(new Error("render failure"));
    const failed = await cache.generateThumbnails(fileId("a"), source, [1]);
    expect(failed[0]).toMatchObject({
      success: false,
      error: "render failure",
    });
    expect(error).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
    await cache.generateThumbnails(fileId("a"), source, [1]);
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it("always releases the lease when a progress callback throws", async () => {
    const cache = service();
    await expect(
      cache.generateThumbnails(fileId("a"), bytes(), [1], {}, () => {
        throw new Error("progress failure");
      }),
    ).rejects.toThrow("progress failure");
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("stops remaining pages and releases after the current render settles", async () => {
    const cache = service();
    const source = bytes();
    const render = deferred<string>();
    mocks.render.mockReturnValueOnce(render.promise);
    const pending = cache.generateThumbnails(fileId("a"), source, [1, 2, 3]);
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    cache.stopGeneration();
    expect(mocks.close).not.toHaveBeenCalled();
    render.resolve("done");
    expect(await pending).toHaveLength(1);
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
    await cache.generateThumbnails(fileId("a"), source, [2]);
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it("destroying during an open releases its late handle and permits a fresh generation", async () => {
    const cache = service();
    const source = bytes();
    const opening = deferred<number>();
    mocks.open.mockReturnValueOnce(opening.promise);
    const pending = cache.generateThumbnails(fileId("a"), source, [1]);
    cache.destroy();
    opening.resolve(100);
    expect(await pending).toEqual([]);
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(100);
    await cache.generateThumbnails(fileId("a"), source, [1]);
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });

  it("bounds idle documents by count and keeps recently reused documents", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const cache = service(2);
    const sources = [bytes(), bytes(), bytes()];
    await cache.generateThumbnails(fileId("a"), sources[0], [1]);
    await cache.generateThumbnails(fileId("b"), sources[1], [1]);
    await cache.generateThumbnails(fileId("a"), sources[0], [2]);
    await cache.generateThumbnails(fileId("c"), sources[2], [1]);
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(2);
    await cache.generateThumbnails(fileId("a"), sources[0], [3]);
    expect(mocks.open).toHaveBeenCalledTimes(3);
    await cache.generateThumbnails(fileId("b"), sources[1], [2]);
    expect(mocks.open).toHaveBeenCalledTimes(4);
    expect(mocks.close.mock.calls).toEqual([[2], [3]]);
  });

  it("bounds retained input bytes and does not retain an oversized document", async () => {
    const cache = service(3, 12);
    await cache.generateThumbnails(fileId("a"), bytes(), [1]);
    await cache.generateThumbnails(fileId("b"), bytes(), [1]);
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
    const large = new ArrayBuffer(20);
    await cache.generateThumbnails(fileId("large"), large, [1]);
    expect(mocks.close.mock.calls).toEqual([[1], [2], [3]]);
    await cache.generateThumbnails(fileId("large"), large, [2]);
    expect(mocks.open).toHaveBeenCalledTimes(4);
    expect(mocks.close.mock.calls).toEqual([[1], [2], [3], [4]]);
  });

  it("allows active requests beyond the budget and trims after they release", async () => {
    const cache = service(1);
    const firstRender = deferred<string>();
    const secondRender = deferred<string>();
    mocks.render
      .mockReturnValueOnce(firstRender.promise)
      .mockReturnValueOnce(secondRender.promise);
    const first = cache.generateThumbnails(fileId("a"), bytes(), [1]);
    const second = cache.generateThumbnails(fileId("b"), bytes(), [1]);
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));
    expect(mocks.close).not.toHaveBeenCalled();
    firstRender.resolve("first");
    await first;
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
    secondRender.resolve("second");
    await second;
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
    cache.destroy();
    expect(mocks.close.mock.calls).toEqual([[1], [2]]);
  });

  it("expires an idle handle once and resets the idle timer when it is reused", async () => {
    vi.useFakeTimers();
    const cache = service(3, 64, 10);
    const source = bytes();
    const first = cache.generateThumbnails(fileId("a"), source, [1]);
    await vi.advanceTimersByTimeAsync(1);
    await first;
    await vi.advanceTimersByTimeAsync(8);
    const second = cache.generateThumbnails(fileId("a"), source, [2]);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    await vi.advanceTimersByTimeAsync(9);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(mocks.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(1);
    cache.destroy();
    await vi.advanceTimersByTimeAsync(30);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
