import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import type { StirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import styles from "@app/components/tools/merge/MergeFileOrder.module.css";

interface MergeFileOrderProps {
  files: StirlingFile[];
  onReorder: (fileIds: FileId[]) => void;
  disabled?: boolean;
}

export default function MergeFileOrder({
  files,
  onReorder,
  disabled = false,
}: MergeFileOrderProps) {
  const { t } = useTranslation();
  const [draggedId, setDraggedId] = useState<FileId | null>(null);

  const moveFile = (fileId: FileId, targetId: FileId) => {
    if (disabled || fileId === targetId) return;
    const ids = files.map((file) => file.fileId);
    const source = ids.indexOf(fileId);
    const target = ids.indexOf(targetId);
    if (source < 0 || target < 0) return;
    ids.splice(source, 1);
    ids.splice(target, 0, fileId);
    onReorder(ids);
  };

  return (
    <ol className={styles.list}>
      {files.map((file, index) => (
        <li
          key={file.fileId}
          className={styles.row}
          draggable={!disabled}
          onDragStart={(event) => {
            setDraggedId(file.fileId);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", file.fileId);
          }}
          onDragEnd={() => setDraggedId(null)}
          onDragOver={(event) => {
            if (draggedId && !disabled) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggedId) moveFile(draggedId, file.fileId);
            setDraggedId(null);
          }}
        >
          <span
            className={styles.handle}
            title={t(
              "workspaceFiles.dragToReorder",
              "Drag to change merge order",
            )}
          >
            <Icon name="grip-vertical" size="0.875rem" />
          </span>
          <span className={styles.position}>{index + 1}</span>
          <span className={styles.name} title={file.name}>
            {file.name}
          </span>
          <ActionIcon
            variant="quiet"
            size="sm"
            disabled={disabled || index === 0}
            aria-label={t("workspaceFiles.moveUp", "Move {{fileName}} up", {
              fileName: file.name,
            })}
            onClick={() => moveFile(file.fileId, files[index - 1].fileId)}
          >
            <Icon name="chevron-up" size="0.875rem" />
          </ActionIcon>
          <ActionIcon
            variant="quiet"
            size="sm"
            disabled={disabled || index === files.length - 1}
            aria-label={t("workspaceFiles.moveDown", "Move {{fileName}} down", {
              fileName: file.name,
            })}
            onClick={() => moveFile(file.fileId, files[index + 1].fileId)}
          >
            <Icon name="chevron-down" size="0.875rem" />
          </ActionIcon>
        </li>
      ))}
    </ol>
  );
}
