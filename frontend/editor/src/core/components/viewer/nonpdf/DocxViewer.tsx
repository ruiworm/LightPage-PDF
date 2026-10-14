import { useEffect, useRef, useState } from "react";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ZoomablePreview } from "@app/components/viewer/nonpdf/ZoomablePreview";
import { WordPreviewLoading } from "@app/components/viewer/nonpdf/WordPreviewLoading";
import {
  cacheWordPreview,
  getWordPreview,
} from "@app/services/wordPreviewCache";

export default function DocxViewer({ file }: { file: Blob }) {
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    let current = true;
    setLoading(true);
    setFailed(false);
    host.current?.replaceChildren();
    const cached = getWordPreview(file);
    if (cached?.kind === "docx" && host.current) {
      host.current.replaceChildren(cached.content.cloneNode(true));
      setLoading(false);
      return;
    }
    const content = document.createElement("div");
    void import("docx-preview")
      .then(async ({ renderAsync }) => {
        await renderAsync(file, content, undefined, {
          className: "document-word",
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          useBase64URL: true,
          renderAltChunks: false,
          renderComments: false,
        });
        if (current && host.current) {
          cacheWordPreview(file, {
            kind: "docx",
            content: content.cloneNode(true) as HTMLDivElement,
          });
          host.current.replaceChildren(content);
          setLoading(false);
        }
      })
      .catch(() => {
        if (current) {
          setLoading(false);
          setFailed(true);
        }
      });
    return () => {
      current = false;
      content.replaceChildren();
    };
  }, [file]);
  return (
    <>
      {loading && <WordPreviewLoading />}
      {failed && (
        <Text role="alert" p="md">
          {t("fileRedaction.wordLayoutUnavailable")}
        </Text>
      )}
      <div hidden={loading || failed} style={{ height: "100%", minHeight: 0 }}>
        <ZoomablePreview
          key={file instanceof File ? file.name : undefined}
          fit="width"
        >
          <div className="nonpdf-word-layout" ref={host} />
        </ZoomablePreview>
      </div>
    </>
  );
}
