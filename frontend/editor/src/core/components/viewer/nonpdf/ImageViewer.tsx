import { useEffect, useState } from "react";
import { ZoomablePreview } from "@app/components/viewer/nonpdf/ZoomablePreview";

interface ImageViewerProps {
  file: File;
  fileName: string;
}

export function ImageViewer({ file, fileName }: ImageViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <ZoomablePreview key={objectUrl} width={width}>
      {objectUrl && (
        <img
          src={objectUrl}
          alt={fileName}
          draggable={false}
          onLoad={(event) => setWidth(event.currentTarget.naturalWidth)}
          style={{ width: "100%" }}
        />
      )}
    </ZoomablePreview>
  );
}
