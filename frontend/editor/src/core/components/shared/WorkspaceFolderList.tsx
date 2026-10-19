import { useEffect, useState, type ReactNode } from "react";
import { Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { FileDocIcon } from "@app/components/shared/FileDocIcon";
import { getFileDocVariant } from "@app/components/shared/filePreview/getFileTypeIcon";
import type { FolderId, FolderRecord } from "@app/types/folder";
import type { StirlingFileStub } from "@app/types/fileContext";
import { workspaceFolderForFile } from "@app/components/shared/useWorkspaceFolder";

interface WorkspaceFolderListProps {
  folders: FolderRecord[];
  selected: FolderId | "";
  files: StirlingFileStub[];
  recent: StirlingFileStub[];
  loading: boolean;
  selectedCount: number;
  renderFile: (file: StirlingFileStub) => ReactNode;
  onFolder: (id: FolderId | "") => void;
  onRecent: (file: StirlingFileStub) => void;
  onOpenFolder?: () => void;
  onAddFiles: () => void;
  onManage: () => void;
}

/** Only the active folder owns a file list; recent entries are bounded shortcuts. */
export function WorkspaceFolderList({
  folders,
  selected,
  files,
  recent,
  loading,
  selectedCount,
  renderFile,
  onFolder,
  onRecent,
  onOpenFolder,
  onAddFiles,
  onManage,
}: WorkspaceFolderListProps) {
  const { t } = useTranslation();
  const [moreRecent, setMoreRecent] = useState(false);
  const [moreFolders, setMoreFolders] = useState(false);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => setExpanded(true), [selected]);

  const toggleFolder = (id: FolderId | "") => {
    if (id === selected) {
      setExpanded((value) => !value);
    } else {
      setExpanded(true);
      onFolder(id);
    }
  };
  const shown = moreFolders
    ? folders
    : folders.filter((folder, index) => index < 5 || folder.id === selected);
  const content = (
    <div className="workspace-folders__files" key={selected}>
      <div className="workspace-folders__scope" role="status">
        {t("workspaceFolders.fileCount", "{{count}} files", {
          count: files.length,
        })}
        {selectedCount > 0 && (
          <span>
            {t("workspaceFiles.selectedCount", "Selected {{count}}", {
              count: selectedCount,
            })}
          </span>
        )}
      </div>
      {loading ? (
        <div className="workspace-folders__empty">
          <Loader size="sm" />
        </div>
      ) : files.length ? (
        files.map(renderFile)
      ) : (
        <p className="workspace-folders__empty">
          {t("workspaceFolders.empty", "No files in this folder")}
        </p>
      )}
    </div>
  );
  return (
    <div className="workspace-folders">
      <section
        className="workspace-folders__recent"
        aria-label={t("workspaceFolders.recent", "Recent projects")}
      >
        <div className="workspace-folders__heading">
          <h2>{t("workspaceFolders.recent", "Recent projects")}</h2>
          <ActionIcon
            size="sm"
            variant="tertiary"
            accent="neutral"
            aria-label={t(
              "workspaceFolders.moreRecent",
              "More recent projects",
            )}
            aria-expanded={moreRecent}
            onClick={() => setMoreRecent(!moreRecent)}
          >
            <Icon name="ellipsis" size="1rem" />
          </ActionIcon>
        </div>
        {recent.slice(0, moreRecent ? 5 : 3).map((file) => (
          <Tooltip key={file.id} content={file.name} position="right">
            <button
              type="button"
              className="workspace-folders__recent-file"
              onClick={() => onRecent(file)}
            >
              <FileDocIcon
                variant={getFileDocVariant(
                  file.name.split(".").pop()?.toLowerCase() ?? "",
                  file.type,
                )}
                style={{ width: 17, height: 20, flexShrink: 0 }}
              />
              <span>
                <span>{file.name}</span>
                <small>
                  {folders.find(
                    (folder) =>
                      folder.id === workspaceFolderForFile(file, folders),
                  )?.name ?? t("workspaceFolders.looseFiles", "Opened files")}
                </small>
              </span>
            </button>
          </Tooltip>
        ))}
        {recent.length === 0 && (
          <p className="workspace-folders__empty">
            {t("workspaceFolders.noRecent", "Opened files appear here")}
          </p>
        )}
      </section>
      <section
        className="workspace-folders__library"
        aria-label={t("workspaceFolders.mine", "My folders")}
      >
        <div className="workspace-folders__heading">
          <h2>{t("workspaceFolders.mine", "My folders")}</h2>
          <Tooltip
            content={t("workspaceFolders.openFolder", "Open folder")}
            position="right"
          >
            <ActionIcon
              size="sm"
              variant="tertiary"
              accent="neutral"
              aria-label={t("workspaceFolders.openFolder", "Open folder")}
              onClick={onOpenFolder ?? onManage}
            >
              <Icon name="folder-plus" size="1rem" />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            content={t("fileSidebar.addFiles", "Add files")}
            position="right"
          >
            <ActionIcon
              size="sm"
              variant="tertiary"
              accent="neutral"
              aria-label={t("fileSidebar.addFiles", "Add files")}
              onClick={onAddFiles}
            >
              <Icon name="plus" size="1rem" />
            </ActionIcon>
          </Tooltip>
        </div>
        <div className="workspace-folders__list">
          {shown.map((folder) => (
            <div key={folder.id}>
              <button
                type="button"
                className="workspace-folders__folder"
                aria-expanded={selected === folder.id && expanded}
                onClick={() => toggleFolder(folder.id)}
                title={folder.directory ?? folder.name}
              >
                <Icon
                  name={
                    selected === folder.id && expanded
                      ? "chevron-down"
                      : "chevron-right"
                  }
                  size="0.8rem"
                />
                <Icon
                  name={
                    selected === folder.id && expanded
                      ? "folder-open"
                      : "folder"
                  }
                  size="1rem"
                />
                <span>{folder.name}</span>
              </button>
              {selected === folder.id && expanded && content}
            </div>
          ))}
          {folders.length > 5 && (
            <button
              type="button"
              className="workspace-folders__more"
              onClick={() => setMoreFolders(!moreFolders)}
            >
              {t(
                moreFolders
                  ? "workspaceFolders.fewerFolders"
                  : "workspaceFolders.moreFolders",
                moreFolders ? "Show fewer folders" : "More folders",
              )}
            </button>
          )}
          <button
            type="button"
            className="workspace-folders__folder"
            aria-expanded={selected === "" && expanded}
            onClick={() => toggleFolder("")}
          >
            <Icon
              name={
                selected === "" && expanded ? "chevron-down" : "chevron-right"
              }
              size="0.8rem"
            />
            <Icon name="files" size="1rem" />
            <span>{t("workspaceFolders.looseFiles", "Opened files")}</span>
          </button>
          {selected === "" && expanded && content}
        </div>
      </section>
    </div>
  );
}
