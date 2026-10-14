import { useEffect, useState } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import TableRedactionPreview from "@app/components/tools/redact/TableRedactionPreview";
import { openTable } from "@app/services/fileRedaction/table";
import type { RedactionDocument } from "@app/types/fileRedaction";
import "@app/components/tools/redact/FileRedaction.css";

export default function OfficeTableViewer({ file }: { file: File }) {
  const { t } = useTranslation();
  const [document, setDocument] = useState<RedactionDocument>();
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setDocument(undefined);
    setError("");
    void openTable(file, "preview", { previewOnly: true })
      .then((value) => {
        if (current) setDocument(value);
      })
      .catch((cause: unknown) => {
        if (current)
          setError(cause instanceof Error ? cause.message : "READ_FAILED");
      });
    return () => {
      current = false;
    };
  }, [file]);
  if (error)
    return (
      <Text role="alert" p="md">
        {t(
          `fileRedaction.errors.${error}`,
          t("fileRedaction.errors.READ_FAILED"),
        )}
      </Text>
    );
  if (!document)
    return (
      <Center p="md">
        <Loader size="sm" aria-label={t("viewer.nonPdf.loading")} />
      </Center>
    );
  return (
    <Stack gap={0} style={{ height: "100%", minHeight: 0 }}>
      {document.kind === "xlsx" && (
        <Text size="xs" c="dimmed" px="md" py="xs">
          {t("viewer.nonPdf.spreadsheetValuesPreview")}
        </Text>
      )}
      <TableRedactionPreview key={file.name} document={document} readOnly />
    </Stack>
  );
}
