import React, { useCallback, useMemo, lazy, Suspense } from "react";
import { Box, Center, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useAllFiles } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  detectFileExtension,
  detectNonPdfFileType,
} from "@app/utils/fileUtils";
import { CONVERSION_MATRIX } from "@app/constants/convertConstants";

import { NonPdfBanner } from "@app/components/viewer/nonpdf/NonPdfBanner";
import { ImageViewer } from "@app/components/viewer/nonpdf/ImageViewer";
import { CsvViewer } from "@app/components/viewer/nonpdf/CsvViewer";
import { JsonViewer } from "@app/components/viewer/nonpdf/JsonViewer";
import { TextViewer } from "@app/components/viewer/nonpdf/TextViewer";
import { HtmlViewer } from "@app/components/viewer/nonpdf/HtmlViewer";
import { WordPreviewLoading } from "@app/components/viewer/nonpdf/WordPreviewLoading";
import { useOptionalFileRedaction } from "@app/contexts/FileRedactionContext";
import { isStirlingFile } from "@app/types/fileContext";

const NonPdfRedactionPreview = lazy(
  () => import("@app/components/tools/redact/NonPdfRedactionPreview"),
);
const DocxViewer = lazy(
  () => import("@app/components/viewer/nonpdf/DocxViewer"),
);
const LegacyWordViewer = lazy(
  () => import("@app/components/viewer/nonpdf/LegacyWordViewer"),
);
const OfficeTableViewer = lazy(
  () => import("@app/components/viewer/nonpdf/OfficeTableViewer"),
);

export interface ViewerProps {
  onClose?: () => void;
  previewFile?: File | null;
}

export interface NonPdfViewerProps extends ViewerProps {
  file: File;
}

export function NonPdfViewer({ file }: NonPdfViewerProps) {
  const { t } = useTranslation();
  const fileType = useMemo(() => detectNonPdfFileType(file), [file]);

  const { handleToolSelect, toolAvailability, selectedToolKey } =
    useToolWorkflow();
  const redaction = useOptionalFileRedaction();
  const redactionDocument =
    selectedToolKey === "redact" && isStirlingFile(file)
      ? redaction?.documents.find((entry) => entry.id === file.fileId)
      : undefined;

  const fileExtension = detectFileExtension(file.name);
  const showConversionBanner =
    fileExtension !== "doc" && fileExtension !== "docx";
  // Only show convert when the extension has an explicit entry in the conversion matrix
  // (skip the 'any'/'image' wildcard fallbacks that would match everything)
  const isConvertAvailable =
    toolAvailability["convert"]?.available === true &&
    fileExtension !== "" &&
    fileExtension in CONVERSION_MATRIX;

  const handleConvertToPdf = useCallback(() => {
    handleToolSelect("convert");
  }, [handleToolSelect]);

  const renderContent = () => {
    if (redactionDocument)
      return (
        <Suspense fallback={null}>
          <NonPdfRedactionPreview document={redactionDocument} />
        </Suspense>
      );
    if (fileExtension === "docx")
      return (
        <Suspense fallback={<WordPreviewLoading />}>
          <DocxViewer key={file.name} file={file} />
        </Suspense>
      );
    if (fileExtension === "doc")
      return (
        <Suspense fallback={<WordPreviewLoading />}>
          <LegacyWordViewer key={file.name} file={file} />
        </Suspense>
      );
    if (fileExtension === "xlsx" || fileExtension === "csv")
      return (
        <Suspense fallback={null}>
          <OfficeTableViewer key={file.name} file={file} />
        </Suspense>
      );
    switch (fileType) {
      case "image":
        return <ImageViewer file={file} fileName={file.name} />;
      case "csv":
        return (
          <CsvViewer
            file={file}
            isTsv={file.name.toLowerCase().endsWith(".tsv")}
          />
        );
      case "json":
        return <JsonViewer file={file} />;
      case "markdown":
        return <TextViewer file={file} isMarkdown />;
      case "text":
        return <TextViewer file={file} isMarkdown={false} />;
      case "html":
        return <HtmlViewer file={file} />;
      default:
        return (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm">
              <Icon
                name="file-text"
                size={"3rem"}
                style={{ color: "var(--mantine-color-gray-4)" }}
              />
              <Text c="dimmed" size="sm">
                {t(
                  "viewer.nonPdf.previewUnavailable",
                  "Preview not available for this file type",
                )}
              </Text>
              {isConvertAvailable && (
                <Button
                  variant="secondary"
                  accent="warning"
                  leftSection={<Icon name="file-pdf" />}
                  onClick={handleConvertToPdf}
                >
                  {t("viewer.nonPdf.convertToPdf", "Convert to PDF")}
                </Button>
              )}
            </Stack>
          </Center>
        );
    }
  };

  return (
    <Stack
      gap={0}
      style={{
        height: "100%",
        flex: 1,
        overflow: "hidden",
        position: "relative",
        // The Convert button floats over the content; viewers that draw their
        // own top bar read this to keep their text clear of it.
        "--nonpdf-action-inset":
          isConvertAvailable && showConversionBanner ? "11rem" : "0rem",
      }}
    >
      <NonPdfBanner
        onConvertToPdf={
          isConvertAvailable && showConversionBanner
            ? handleConvertToPdf
            : undefined
        }
      />
      <Box
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {renderContent()}
      </Box>
    </Stack>
  );
}

// ─── Wrapper that resolves the active file from FileContext ───────────────────

export function NonPdfViewerWrapper(props: ViewerProps) {
  const { t } = useTranslation();
  const { files: activeFiles } = useAllFiles();
  const { activeFileId } = useViewer();

  const file =
    props.previewFile ??
    activeFiles.find((file) => file.fileId === activeFileId) ??
    null;

  if (!file) {
    return (
      <Center style={{ flex: 1 }}>
        <Text c="dimmed" size="sm">
          {t("viewer.nonPdf.noFile", "No file loaded")}
        </Text>
      </Center>
    );
  }

  return <NonPdfViewer {...props} file={file} />;
}

export default NonPdfViewerWrapper;
