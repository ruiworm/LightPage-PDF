/**
 * Tests for auto-detection and smart conversion features in useConvertParameters
 * This covers the analyzeFileTypes function and related smart detection logic
 */

import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";

describe("useConvertParameters - Auto Detection & Smart Conversion", () => {
  describe("Single File Detection", () => {
    test("should detect single file extension and set auto-target", () => {
      const { result } = renderHook(() => useConvertParameters());

      const pdfFile = [{ name: "document.pdf" }];

      act(() => {
        result.current.analyzeFileTypes(pdfFile);
      });

      expect(result.current.parameters.fromExtension).toBe("pdf");
      expect(result.current.parameters.toExtension).toBe(""); // No auto-selection for multiple targets
      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe("none");
    });

    test("rejects unsupported file types instead of guessing a PDF converter", () => {
      const { result } = renderHook(() => useConvertParameters());

      const unknownFile = [{ name: "document.xyz" }, { name: "image.jpggg" }];

      act(() => {
        result.current.analyzeFileTypes([{ name: "document.docx" }]);
      });
      expect(result.current.parameters.toExtension).toBe("pdf");

      act(() => {
        result.current.analyzeFileTypes(unknownFile);
      });

      expect(result.current.parameters.fromExtension).toBe("");
      expect(result.current.parameters.toExtension).toBe("");
      expect(result.current.parameters.isSmartDetection).toBe(false);
    });

    test("leaves files without extensions unconfigured", () => {
      const { result } = renderHook(() => useConvertParameters());

      const noExtFile = [{ name: "document" }];

      act(() => {
        result.current.analyzeFileTypes(noExtFile);
      });

      expect(result.current.parameters.fromExtension).toBe("");
      expect(result.current.parameters.toExtension).toBe("");
    });
  });

  describe("Multiple Identical Files", () => {
    test("should detect multiple PDF files and set auto-target", () => {
      const { result } = renderHook(() => useConvertParameters());

      const pdfFiles = [
        { name: "doc1.pdf" },
        { name: "doc2.pdf" },
        { name: "doc3.pdf" },
      ];

      act(() => {
        result.current.analyzeFileTypes(pdfFiles);
      });

      expect(result.current.parameters.fromExtension).toBe("pdf");
      expect(result.current.parameters.toExtension).toBe(""); // Auto-selected
      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe("none");
    });

    test("rejects a batch of unsupported file types", () => {
      const { result } = renderHook(() => useConvertParameters());

      const unknownFiles = [{ name: "file1.xyz" }, { name: "file2.xyz" }];

      act(() => {
        result.current.analyzeFileTypes(unknownFiles);
      });

      expect(result.current.parameters.fromExtension).toBe("");
      expect(result.current.parameters.toExtension).toBe("");
      expect(result.current.parameters.isSmartDetection).toBe(false);
    });
  });

  describe("Smart Detection - All Images", () => {
    test("should detect all image files and enable smart detection", () => {
      const { result } = renderHook(() => useConvertParameters());

      const imageFiles = [
        { name: "photo1.jpg" },
        { name: "photo2.png" },
        { name: "photo3.gif" },
      ];

      act(() => {
        result.current.analyzeFileTypes(imageFiles);
      });

      expect(result.current.parameters.fromExtension).toBe("image");
      expect(result.current.parameters.toExtension).toBe("pdf");
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe("images");
    });

    test("should handle mixed case image extensions", () => {
      const { result } = renderHook(() => useConvertParameters());

      const imageFiles = [{ name: "photo1.JPG" }, { name: "photo2.PNG" }];

      act(() => {
        result.current.analyzeFileTypes(imageFiles);
      });

      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe("images");
    });
  });

  describe("Smart Detection - All Web Files", () => {
    test("does not reactivate removed web conversion for HTML and ZIP", () => {
      const { result } = renderHook(() => useConvertParameters());

      const webFiles = [{ name: "page1.html" }, { name: "archive.zip" }];

      act(() => {
        result.current.analyzeFileTypes(webFiles);
      });

      expect(result.current.parameters.fromExtension).toBe("");
      expect(result.current.parameters.toExtension).toBe("");
      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe("none");
    });

    test("does not reactivate removed web conversion for uppercase extensions", () => {
      const { result } = renderHook(() => useConvertParameters());

      const webFiles = [{ name: "page1.HTML" }, { name: "archive.ZIP" }];

      act(() => {
        result.current.analyzeFileTypes(webFiles);
      });

      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe("none");
    });

    test("leaves removed web formats without a target", () => {
      const { result } = renderHook(() => useConvertParameters());

      const zipFiles = [{ name: "site1.zip" }, { name: "site2.html" }];

      act(() => {
        result.current.analyzeFileTypes(zipFiles);
      });

      expect(result.current.parameters.fromExtension).toBe("");
      expect(result.current.parameters.toExtension).toBe("");
      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe("none");
    });
  });

  describe("Smart Detection - Mixed File Types", () => {
    test("should detect mixed file types and enable smart detection", () => {
      const { result } = renderHook(() => useConvertParameters());

      const mixedFiles = [
        { name: "document.pdf" },
        { name: "spreadsheet.xlsx" },
        { name: "presentation.pptx" },
      ];

      act(() => {
        result.current.analyzeFileTypes(mixedFiles);
      });

      expect(result.current.parameters.fromExtension).toBe("any");
      expect(result.current.parameters.toExtension).toBe("pdf");
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe("mixed");
    });

    test("should detect mixed images and documents as mixed type", () => {
      const { result } = renderHook(() => useConvertParameters());

      const mixedFiles = [
        { name: "photo.jpg" },
        { name: "document.pdf" },
        { name: "document.docx" },
      ];

      act(() => {
        result.current.analyzeFileTypes(mixedFiles);
      });

      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe("mixed");
    });

    test("rejects mixed batches containing unsupported formats", () => {
      const { result } = renderHook(() => useConvertParameters());

      const mixedFiles = [
        { name: "document.pdf" },
        { name: "unknown.xyz" },
        { name: "noextension" },
      ];

      act(() => {
        result.current.analyzeFileTypes(mixedFiles);
      });

      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe("none");
    });
  });

  describe("Smart Detection Endpoint Resolution", () => {
    test("should return correct endpoint for image smart detection", () => {
      const { result } = renderHook(() => useConvertParameters());

      const imageFiles = [{ name: "photo1.jpg" }, { name: "photo2.png" }];

      act(() => {
        result.current.analyzeFileTypes(imageFiles);
      });

      expect(result.current.getEndpointName()).toBe("img-to-pdf");
      expect(result.current.getEndpoint()).toBe("/api/v1/convert/img/pdf");
    });

    test("does not resolve a conversion endpoint for removed web formats", () => {
      const { result } = renderHook(() => useConvertParameters());

      const webFiles = [{ name: "page1.html" }, { name: "archive.zip" }];

      act(() => {
        result.current.analyzeFileTypes(webFiles);
      });

      expect(result.current.getEndpointName()).toBe("");
      expect(result.current.getEndpoint()).toBe("");
    });

    test("should return correct endpoint for mixed smart detection", () => {
      const { result } = renderHook(() => useConvertParameters());

      const mixedFiles = [
        { name: "document.pdf" },
        { name: "spreadsheet.xlsx" },
      ];

      act(() => {
        result.current.analyzeFileTypes(mixedFiles);
      });

      expect(result.current.getEndpointName()).toBe("file-to-pdf");
      expect(result.current.getEndpoint()).toBe("/api/v1/convert/file/pdf");
    });
  });

  describe("Auto-Target Selection Logic", () => {
    test("should select single available target automatically", () => {
      const { result } = renderHook(() => useConvertParameters());

      const wordFile = [{ name: "document.docx" }];

      act(() => {
        result.current.analyzeFileTypes(wordFile);
      });

      expect(result.current.parameters.fromExtension).toBe("docx");
      expect(result.current.parameters.toExtension).toBe("pdf"); // Only available target
    });

    test("should not auto-select when multiple targets available", () => {
      const { result } = renderHook(() => useConvertParameters());

      // PDF has multiple conversion targets, so no auto-selection
      const pdfFile = [{ name: "document.pdf" }];

      act(() => {
        result.current.analyzeFileTypes(pdfFile);
      });

      expect(result.current.parameters.fromExtension).toBe("pdf");
      // Should NOT auto-select when multiple targets available
      expect(result.current.parameters.toExtension).toBe("");
    });
  });

  describe("Edge Cases", () => {
    test("leaves empty file names unconfigured", () => {
      const { result } = renderHook(() => useConvertParameters());

      const emptyFiles = [{ name: "" }];

      act(() => {
        result.current.analyzeFileTypes(emptyFiles);
      });

      expect(result.current.parameters.fromExtension).toBe("");
      expect(result.current.parameters.toExtension).toBe("");
    });

    test("does not start a mixed batch containing malformed file objects", () => {
      const { result } = renderHook(() => useConvertParameters());

      const malformedFiles: Array<{ name: string }> = [
        { name: "valid.pdf" },
        // @ts-expect-error - Testing runtime resilience
        { name: null },
        // @ts-expect-error - Testing runtime resilience
        { name: undefined },
      ];

      act(() => {
        result.current.analyzeFileTypes(malformedFiles);
      });

      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe("none");
    });
  });
});
