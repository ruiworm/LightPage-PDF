import { useEffect, useState } from "react";
import { Select, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileRedaction } from "@app/contexts/FileRedactionContext";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";

export default function FileRedactionActions() {
  const { t } = useTranslation();
  const session = useFileRedaction();
  const active = session.documents.find(
    (doc) => doc.id === session.activeDocumentId,
  );
  const [message, setMessage] = useState("");
  const [lastExport, setLastExport] = useState<{
    url: string;
    name: string;
  } | null>(null);
  useEffect(
    () => () => {
      if (lastExport) URL.revokeObjectURL(lastExport.url);
    },
    [lastExport],
  );

  const exportSelected = async (all: boolean) => {
    setMessage("");
    try {
      const files = await session.exportFiles(
        all
          ? session.documents.map((doc) => doc.id)
          : active
            ? [active.id]
            : [],
      );
      if (!files.length) return;
      let blob: Blob = files[0];
      let name = files[0].name;
      if (files.length > 1) {
        const { default: JSZip } = await import("jszip");
        const archive = new JSZip();
        files.forEach((file, index) => {
          const entry = archive.file(file.name)
            ? file.name.replace(/(\.[^.]+)$/, `_${index + 1}$1`)
            : file.name;
          archive.file(entry, file);
        });
        blob = await archive.generateAsync({
          type: "blob",
          compression: "DEFLATE",
        });
        name = `${t("fileRedaction.exportArchive")}.zip`;
      }
      const url = URL.createObjectURL(blob);
      setLastExport({ url, name });
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setMessage(t("fileRedaction.exported", { count: files.length }));
    } catch {
      setMessage(t("fileRedaction.errors.EXPORT_FAILED"));
    }
  };

  return (
    <div className="file-redaction-actions">
      {session.documents.length > 1 && (
        <Select
          size="xs"
          label={t("fileRedaction.resultFile")}
          placeholder={t("fileRedaction.chooseResultFile")}
          data={session.documents.map((doc) => ({
            value: doc.id,
            label: doc.file.name,
          }))}
          value={session.activeDocumentId}
          onChange={(id) => {
            if (id) session.setActiveDocument(id);
          }}
          disabled={session.busy}
        />
      )}
      {active?.warnings.includes("legacyWordPdf") &&
        active.pages.length > 1 && (
          <div
            className="file-redaction-inline-actions"
            aria-label={t("viewer.pageNavigation")}
          >
            <ActionIcon
              variant="quiet"
              aria-label={t("viewer.previousPage")}
              disabled={session.busy || session.activePageIndex <= 0}
              onClick={() => session.setActivePage(session.activePageIndex - 1)}
            >
              <Icon name="chevron-left" size={16} />
            </ActionIcon>
            <span aria-live="polite">
              {session.activePageIndex + 1} / {active.pages.length}
            </span>
            <ActionIcon
              variant="quiet"
              aria-label={t("viewer.nextPage")}
              disabled={
                session.busy ||
                session.activePageIndex >= active.pages.length - 1
              }
              onClick={() => session.setActivePage(session.activePageIndex + 1)}
            >
              <Icon name="chevron-right" size={16} />
            </ActionIcon>
          </div>
        )}
      <div className="file-redaction-action-row">
        <Switch
          size="xs"
          label={t("fileRedaction.preview")}
          checked={session.preview && !!active}
          onChange={(event) => session.setPreview(event.currentTarget.checked)}
          disabled={!active || session.busy}
        />
        <div className="file-redaction-history-actions">
          <ActionIcon
            variant="quiet"
            disabled={!session.canUndo || session.busy}
            onClick={session.undo}
            aria-label={t("fileRedaction.undo")}
            title={t("fileRedaction.undo")}
          >
            <Icon name="undo-2" size={16} />
          </ActionIcon>
          <ActionIcon
            variant="quiet"
            disabled={!session.canRedo || session.busy}
            onClick={session.redo}
            aria-label={t("fileRedaction.redo")}
            title={t("fileRedaction.redo")}
          >
            <Icon name="redo-2" size={16} />
          </ActionIcon>
        </div>
      </div>
      <Button
        size="sm"
        variant={session.drawing ? "secondary" : "tertiary"}
        disabled={
          !active ||
          !!active.table ||
          (active.kind === "docx" &&
            !active.pages.find((page) => page.index === session.activePageIndex)
              ?.media) ||
          session.busy ||
          session.preview
        }
        onClick={() => session.setDrawing(!session.drawing)}
        leftSection={<Icon name="scan" size={15} />}
      >
        {t(
          session.drawing
            ? "fileRedaction.finishDrawing"
            : "fileRedaction.drawRegion",
        )}
      </Button>
      {active?.kind === "docx" && (
        <div className="file-redaction-inline-actions">
          {["layout", "text"].map((view) => (
            <Button
              key={view}
              size="sm"
              variant={session.wordView === view ? "secondary" : "tertiary"}
              onClick={() => session.setWordView(view)}
            >
              {t(`fileRedaction.wordViews.${view}`)}
            </Button>
          ))}
        </div>
      )}
      <div className="file-redaction-export-actions">
        <Button
          size="sm"
          disabled={!active || session.busy}
          onClick={() => void exportSelected(false)}
          leftSection={<Icon name="download" size={15} />}
        >
          {t("fileRedaction.export")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!session.documents.length || session.busy}
          onClick={() => void exportSelected(true)}
        >
          {t("fileRedaction.exportAll")}
        </Button>
      </div>
      {!active && session.documents.length > 0 && (
        <p className="file-redaction-note">
          {t("fileRedaction.currentFileUnscanned")}
        </p>
      )}
      {active?.warnings.map((key) => (
        <p className="file-redaction-note" key={key}>
          {t(`fileRedaction.warnings.${key}`)}
        </p>
      ))}
      {message && (
        <div role="status" className="file-redaction-export-message">
          {message}
          {lastExport && (
            <a href={lastExport.url} download={lastExport.name}>
              {t("fileRedaction.downloadResult")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
