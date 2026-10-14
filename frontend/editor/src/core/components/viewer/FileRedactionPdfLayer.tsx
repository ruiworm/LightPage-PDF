import { useDocumentState } from "@embedpdf/core/react";
import FileRedactionLayer from "@app/components/tools/redact/FileRedactionLayer";

export default function FileRedactionPdfLayer({
  documentId,
  fileId,
  pageIndex,
  width,
  height,
}: {
  documentId: string;
  fileId: string;
  pageIndex: number;
  width: number;
  height: number;
}) {
  const state = useDocumentState(documentId);
  const rotation = state?.document?.pages[pageIndex]?.rotation ?? 0;
  // Detection uses the file's intrinsic orientation. Undo that rotation here;
  // the existing Rotate wrapper then applies intrinsic + reader rotation once.
  const transform =
    rotation === 1
      ? `matrix(0,-1,1,0,0,${height})`
      : rotation === 2
        ? `matrix(-1,0,0,-1,${width},${height})`
        : rotation === 3
          ? `matrix(0,1,-1,0,${width},0)`
          : undefined;
  return (
    <FileRedactionLayer
      fileId={fileId}
      pageIndex={pageIndex}
      width={rotation % 2 ? height : width}
      height={rotation % 2 ? width : height}
      rotation={state?.rotation ?? 0}
      style={{ transform, transformOrigin: "0 0" }}
    />
  );
}
