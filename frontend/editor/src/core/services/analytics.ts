import posthog from "posthog-js";

const DEV = process.env.NODE_ENV === "development";

function canCapture(): boolean {
  return false;
}

export function trackPdfUploaded(files: File[]): void {
  try {
    if (!canCapture() || !files) return;
    for (let i = 0; i < files.length; i++) {
      posthog.capture("editor_pdf_uploaded", { source: "editor" });
    }
  } catch (error) {
    if (DEV) console.warn("[analytics] trackPdfUploaded failed", error);
  }
}

export function trackEditorOperation(toolId: string, fileCount: number): void {
  try {
    if (!canCapture()) return;
    posthog.capture("editor_operation", {
      source: "editor",
      tool: toolId,
      file_count: fileCount,
    });
  } catch (error) {
    if (DEV) console.warn("[analytics] trackEditorOperation failed", error);
  }
}
