/**
 * High-performance thumbnail generation service using main thread processing
 */

import { FileId } from "@app/types/file";
import {
  openRawDocumentSafe,
  closeRawDocument,
} from "@app/services/pdfiumService";
import { renderPdfiumPageDataUrl } from "@app/utils/pdfiumPageRender";

export interface ThumbnailResult {
  pageNumber: number;
  thumbnail: string;
  success: boolean;
  error?: string;
}

interface ThumbnailGenerationOptions {
  scale?: number;
  quality?: number;
  batchSize?: number;
  parallelBatches?: number;
}

interface CachedThumbnail {
  thumbnail: string;
  lastUsed: number;
  sizeBytes: number;
}

interface CachedPDFDocument {
  source: WeakRef<ArrayBuffer>;
  sizeBytes: number;
  opening: Promise<number>;
  docPtr: number | null;
  lastUsed: number;
  refCount: number;
  retained: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export class ThumbnailGenerationService {
  // Session-based thumbnail cache
  private thumbnailCache = new Map<
    FileId | string /* FIX ME: Page ID */,
    CachedThumbnail
  >();
  private maxCacheSizeBytes = 1024 * 1024 * 1024; // 1GB cache limit
  private currentCacheSize = 0;

  private pdfDocumentCache = new Map<FileId, CachedPDFDocument>();
  private pdfCacheAccess = 0;
  private generation = 0;

  /** Active leases may exceed the cache budget until their renders finish.
   * The byte limit budgets source bytes copied into PDFium, not its full heap. */
  constructor(
    private maxPdfCacheSize = 3,
    private maxPdfCacheSizeBytes = 64 * 1024 * 1024,
    private pdfCacheIdleMs = 30_000,
  ) {}

  /**
   * Acquires a lease on these exact bytes; replacement must not close old renders.
   */
  private async getCachedPDFDocument(
    fileId: FileId,
    pdfArrayBuffer: ArrayBuffer,
  ): Promise<CachedPDFDocument> {
    let cached = this.pdfDocumentCache.get(fileId);
    if (cached && cached.source.deref() !== pdfArrayBuffer) {
      this.retirePDFDocument(fileId, cached);
      cached = undefined;
    }
    if (cached) {
      cached.lastUsed = ++this.pdfCacheAccess;
      cached.refCount++;
      if (cached.idleTimer !== null) {
        clearTimeout(cached.idleTimer);
        cached.idleTimer = null;
      }
    } else {
      const opening = openRawDocumentSafe(pdfArrayBuffer);
      cached = {
        source: new WeakRef(pdfArrayBuffer),
        sizeBytes: pdfArrayBuffer.byteLength,
        opening,
        docPtr: null,
        lastUsed: ++this.pdfCacheAccess,
        refCount: 1,
        retained: true,
        idleTimer: null,
      };
      const entry = cached;
      entry.opening = opening.then(
        (docPtr) => {
          entry.docPtr = docPtr;
          return docPtr;
        },
        (error: unknown) => {
          this.retirePDFDocument(fileId, entry);
          throw error;
        },
      );
      this.pdfDocumentCache.set(fileId, entry);
      this.trimPDFCache();
    }

    try {
      await cached.opening;
      return cached;
    } catch (error) {
      this.releasePDFDocument(fileId, cached);
      throw error;
    }
  }

  private releasePDFDocument(fileId: FileId, entry: CachedPDFDocument): void {
    entry.refCount--;
    if (entry.refCount > 0) return;
    if (!entry.retained) {
      this.closePDFDocument(entry);
      return;
    }
    entry.lastUsed = ++this.pdfCacheAccess;
    entry.idleTimer = setTimeout(
      () => this.retirePDFDocument(fileId, entry),
      this.pdfCacheIdleMs,
    );
    this.trimPDFCache();
  }

  private retirePDFDocument(fileId: FileId, entry: CachedPDFDocument): void {
    if (this.pdfDocumentCache.get(fileId) === entry) {
      this.pdfDocumentCache.delete(fileId);
    }
    entry.retained = false;
    if (entry.idleTimer !== null) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    if (entry.refCount === 0) this.closePDFDocument(entry);
  }

  private closePDFDocument(entry: CachedPDFDocument): void {
    const docPtr = entry.docPtr;
    entry.docPtr = null;
    if (docPtr !== null) {
      void closeRawDocument(docPtr).catch((error: unknown) => {
        console.error("Failed to close thumbnail PDF document:", error);
      });
    }
  }

  private trimPDFCache(): void {
    let sizeBytes = [...this.pdfDocumentCache.values()].reduce(
      (sum, entry) => sum + entry.sizeBytes,
      0,
    );
    while (
      this.pdfDocumentCache.size > this.maxPdfCacheSize ||
      sizeBytes > this.maxPdfCacheSizeBytes
    ) {
      let oldest: [FileId, CachedPDFDocument] | null = null;
      for (const candidate of this.pdfDocumentCache.entries()) {
        if (
          candidate[1].refCount === 0 &&
          (!oldest || candidate[1].lastUsed < oldest[1].lastUsed)
        ) {
          oldest = candidate;
        }
      }
      if (!oldest) return;
      sizeBytes -= oldest[1].sizeBytes;
      this.retirePDFDocument(...oldest);
    }
  }

  /**
   * Generate thumbnails for multiple pages using main thread processing
   */
  async generateThumbnails(
    fileId: FileId,
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    options: ThumbnailGenerationOptions = {},
    onProgress?: (progress: {
      completed: number;
      total: number;
      thumbnails: ThumbnailResult[];
    }) => void,
  ): Promise<ThumbnailResult[]> {
    // Input validation
    if (!fileId || typeof fileId !== "string" || fileId.trim() === "") {
      throw new Error("generateThumbnails: fileId must be a non-empty string");
    }

    if (!pdfArrayBuffer || pdfArrayBuffer.byteLength === 0) {
      throw new Error("generateThumbnails: pdfArrayBuffer must not be empty");
    }

    if (!pageNumbers || pageNumbers.length === 0) {
      throw new Error("generateThumbnails: pageNumbers must not be empty");
    }

    const { scale = 0.2, quality = 0.8 } = options;

    return await this.generateThumbnailsMainThread(
      fileId,
      pdfArrayBuffer,
      pageNumbers,
      scale,
      quality,
      onProgress,
    );
  }

  /**
   * Main thread thumbnail generation with batching for UI responsiveness
   */
  private async generateThumbnailsMainThread(
    fileId: FileId,
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    scale: number,
    quality: number,
    onProgress?: (progress: {
      completed: number;
      total: number;
      thumbnails: ThumbnailResult[];
    }) => void,
  ): Promise<ThumbnailResult[]> {
    const generation = this.generation;
    const entry = await this.getCachedPDFDocument(fileId, pdfArrayBuffer);
    const docPtr = entry.docPtr!;

    const allResults: ThumbnailResult[] = [];
    let completed = 0;
    let successful = false;
    const batchSize = 3; // Smaller batches for better UI responsiveness

    try {
      for (
        let i = 0;
        i < pageNumbers.length && generation === this.generation;
        i += batchSize
      ) {
        const batch = pageNumbers.slice(i, i + batchSize);

        // Process batch sequentially (to avoid canvas conflicts)
        for (const pageNumber of batch) {
          if (generation !== this.generation) break;
          try {
            const thumbnail = await renderPdfiumPageDataUrl(
              docPtr,
              pageNumber - 1,
              scale,
              { applyRotation: false, format: "jpeg", quality },
            );
            if (!thumbnail) {
              throw new Error(`Could not render page ${pageNumber}`);
            }
            allResults.push({ pageNumber, thumbnail, success: true });
          } catch (error) {
            console.error(
              `Failed to generate thumbnail for page ${pageNumber}:`,
              error,
            );
            allResults.push({
              pageNumber,
              thumbnail: "",
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        completed = allResults.length;

        // Report progress
        if (onProgress) {
          onProgress({
            completed,
            total: pageNumbers.length,
            thumbnails: allResults
              .slice(-batch.length)
              .filter((r) => r.success),
          });
        }

        // Yield control to prevent UI blocking
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      successful =
        generation === this.generation &&
        allResults.every((result) => result.success);
      return allResults;
    } finally {
      if (!successful) this.retirePDFDocument(fileId, entry);
      this.releasePDFDocument(fileId, entry);
    }
  }

  /**
   * Cache management
   */
  getThumbnailFromCache(pageId: string): string | null {
    const cached = this.thumbnailCache.get(pageId);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.thumbnail;
    }
    return null;
  }

  addThumbnailToCache(pageId: string, thumbnail: string): void {
    const sizeBytes = thumbnail.length * 2; // Rough estimate for base64 string

    // Enforce cache size limits
    while (
      this.currentCacheSize + sizeBytes > this.maxCacheSizeBytes &&
      this.thumbnailCache.size > 0
    ) {
      this.evictLeastRecentlyUsed();
    }

    this.thumbnailCache.set(pageId, {
      thumbnail,
      lastUsed: Date.now(),
      sizeBytes,
    });

    this.currentCacheSize += sizeBytes;
  }

  private evictLeastRecentlyUsed(): void {
    let oldestEntry: [string, CachedThumbnail] | null = null;
    let oldestTime = Date.now();

    for (const [key, value] of this.thumbnailCache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestEntry = [key, value];
      }
    }

    if (oldestEntry) {
      this.thumbnailCache.delete(oldestEntry[0]);
      this.currentCacheSize -= oldestEntry[1].sizeBytes;
    }
  }

  getCacheStats() {
    return {
      size: this.thumbnailCache.size,
      sizeBytes: this.currentCacheSize,
      maxSizeBytes: this.maxCacheSizeBytes,
    };
  }

  /** Stops after the current native render; future calls can start a new generation. */
  stopGeneration(): void {
    this.generation++;
    this.clearPDFCache();
  }

  clearCache(): void {
    this.thumbnailCache.clear();
    this.currentCacheSize = 0;
  }

  /** Invalidates pending and cached opens, closing active handles after their last lease. */
  clearPDFCache(): void {
    for (const [fileId, cached] of this.pdfDocumentCache) {
      this.retirePDFDocument(fileId, cached);
    }
  }

  /** Invalidates this file's native cache without closing another caller's render. */
  clearPDFCacheForFile(fileId: FileId): void {
    const cached = this.pdfDocumentCache.get(fileId);
    if (cached) {
      this.retirePDFDocument(fileId, cached);
    }
  }

  /**
   * Explicitly evicts an idle document; an active render keeps its lease.
   */
  cleanupCompletedDocument(fileId: FileId): void {
    const cached = this.pdfDocumentCache.get(fileId);
    if (cached) {
      this.retirePDFDocument(fileId, cached);
    }
  }

  destroy(): void {
    this.clearCache();
    this.stopGeneration();
  }
}

// Global singleton instance
export const thumbnailGenerationService = new ThumbnailGenerationService();
