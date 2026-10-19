import { useEffect, useRef, useState } from "react";
import { FileInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";

export default function FileRedactionRestore({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [recovery, setRecovery] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; name: string } | null>(
    null,
  );
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  const restore = async () => {
    if (!recovery || !files.length || busy || disabled) return;
    const version = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const { restoreAliasFiles } =
        await import("@app/services/fileRedaction/recovery");
      const restored = await restoreAliasFiles(recovery, files);
      let output: Blob = restored[0];
      let name = restored[0].name;
      if (restored.length > 1) {
        const { default: JSZip } = await import("jszip");
        const archive = new JSZip();
        restored.forEach((file, index) =>
          archive.file(`${index + 1}/${file.name}`, file),
        );
        output = await archive.generateAsync({
          type: "blob",
          compression: "DEFLATE",
        });
        name = `${t("fileRedaction.restore.archive")}.zip`;
      }
      if (generation.current === version)
        setResult({ url: URL.createObjectURL(output), name });
    } catch (failure) {
      if (generation.current === version)
        setError(
          failure instanceof Error && failure.message === "RECOVERY_MISMATCH"
            ? t("fileRedaction.restore.mismatch")
            : t("fileRedaction.restore.invalid"),
        );
    } finally {
      if (generation.current === version) setBusy(false);
    }
  };

  return (
    <details className="file-redaction-restore">
      <summary>{t("fileRedaction.restore.title")}</summary>
      <p className="file-redaction-note">
        {t("fileRedaction.restore.instructions")}
      </p>
      <FileInput
        label={t("fileRedaction.restore.recoveryFile")}
        accept=".lp-restore"
        value={recovery}
        onChange={(file) => {
          setRecovery(file);
          setResult(null);
          setError("");
        }}
        disabled={busy || disabled}
        clearable
      />
      <FileInput
        label={t("fileRedaction.restore.redactedFiles")}
        accept=".pdf,.docx,.xlsx,.csv,.png"
        multiple
        value={files}
        onChange={(selected) => {
          setFiles(selected);
          setResult(null);
          setError("");
        }}
        disabled={busy || disabled}
        clearable
      />
      <Button
        variant="secondary"
        onClick={() => void restore()}
        loading={busy}
        disabled={disabled || !recovery || !files.length}
      >
        {t("fileRedaction.restore.run")}
      </Button>
      {error && (
        <p className="file-redaction-note" role="alert">
          {error}
        </p>
      )}
      {result && (
        <p role="status">
          <a href={result.url} download={result.name}>
            {t("fileRedaction.restore.download")}
          </a>
        </p>
      )}
    </details>
  );
}
