import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { Button } from "@app/ui/Button";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFileManager } from "@app/hooks/useFileManager";
import { StirlingFile } from "@app/types/fileContext";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { formatFileSize } from "@app/utils/fileUtils";

export interface FileStatusIndicatorProps {
  selectedFiles?: StirlingFile[];
  minFiles?: number;
}

const FileStatusIndicator = ({
  selectedFiles = [],
  minFiles = 1,
}: FileStatusIndicatorProps) => {
  const { t } = useTranslation();
  const { openFilesModal, onFileUpload } = useFilesModalContext();
  const { files: allFiles } = useAllFiles();
  const { loadRecentFiles } = useFileManager();
  const [hasRecentFiles, setHasRecentFiles] = useState<boolean | null>(null);
  const ready = selectedFiles.length >= minFiles;

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void loadRecentFiles()
      .then((files) => {
        if (!cancelled) setHasRecentFiles(files.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasRecentFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, loadRecentFiles]);

  const handleNativeUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,application/pdf";
    input.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length) onFileUpload(files);
    };
    input.click();
  };

  if (ready) {
    return (
      <div className="tool-file-status" role="status">
        <div className="tool-file-status__ready">
          <span className="tool-file-status__icon" aria-hidden>
            <Icon name="file-text" size={18} />
          </span>
          <div className="tool-file-status__name">
            {selectedFiles.length === 1 ? (
              <PrivateContent>{selectedFiles[0].name}</PrivateContent>
            ) : (
              t("filesSelected", "{{count}} files", {
                count: selectedFiles.length,
              })
            )}
            <span className="tool-file-status__meta">
              {formatFileSize(
                selectedFiles.reduce((size, file) => size + file.size, 0),
              )}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tool-file-status">
      {allFiles.length > 0 && (
        <p className="tool-settings-group__help">
          {minFiles > 1
            ? t(
                "files.selectMultipleFromWorkbench",
                "Add at least {{count}} files to the workbench or ",
                { count: minFiles },
              )
            : t("files.selectFromWorkbench", "Add files to the workbench or ")}
        </p>
      )}
      <Button
        variant="secondary"
        size="sm"
        fullWidth
        leftSection={
          <Icon name={hasRecentFiles === false ? "upload" : "plus"} size={16} />
        }
        onClick={
          hasRecentFiles === false
            ? handleNativeUpload
            : () => openFilesModal({})
        }
      >
        {hasRecentFiles === false
          ? t("files.uploadFiles", "Upload Files")
          : t("files.addFiles", "Add files")}
      </Button>
    </div>
  );
};

export default FileStatusIndicator;
