import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
} from "react";
import { Tooltip } from "@mantine/core";
import { NavSurface } from "@app/ui/NavSurface";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import {
  useFileState,
  useFileActions,
  useFileSelectors,
} from "@app/contexts/file/fileHooks";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useGoogleDrivePicker } from "@app/hooks/useGoogleDrivePicker";
import {
  useNavigationState,
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { usePageEditor } from "@app/contexts/PageEditorContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
import { useFreeCreditsSummary } from "@app/hooks/useFreeCreditsSummary";
import { useOpenPlan } from "@app/hooks/useOpenPlan";
import { NavFooter } from "@app/components/shared/navFooter/NavFooter";
import {
  useIndexedDB,
  useIndexedDBRevision,
} from "@app/contexts/IndexedDBContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { FileItem } from "@app/components/shared/FileSidebarFileItem";
import { useLabelName } from "@app/data/labelDisplay";
import { useClassificationEnabled } from "@app/hooks/useClassificationEnabled";
import BulkUploadToServerModal from "@app/components/shared/BulkUploadToServerModal";
import { getFileOrigin } from "@app/components/filesPage/fileOrigin";
import { VersionHistoryModal } from "@app/components/filesPage/VersionHistoryModal";
import { DeleteFilesDialog } from "@app/components/filesPage/DeleteFilesDialog";
import { RenameFileDialog } from "@app/components/shared/RenameFileDialog";
import { duplicateStoredFile } from "@app/utils/duplicateFile";
import { SidebarChecklistSlot } from "@app/components/shared/SidebarChecklistSlot";
import {
  deleteServerFile,
  type DeleteScope,
} from "@app/services/serverStorageDelete";
import { fileStorage, onRecordUnreadable } from "@app/services/fileStorage";
import { downloadFileWithPolicy } from "@app/services/exportWithPolicy";
import { useOpenInNewWindow } from "@app/extensions/openInNewWindow";
import { alert } from "@app/components/toast";
import { useBulkAddProgress } from "@app/services/bulkAddProgress";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { useCoalescedCallback } from "@app/hooks/useCoalescedCallback";
import { FolderTreeSidebar } from "@app/components/filesPage/FolderTreeSidebar";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import type { FolderId, FolderRecord } from "@app/types/folder";
import { useToolEligibleFileIds } from "@app/contexts/ToolFileEligibilityContext";
import {
  useWorkspaceFolder,
  workspaceFolderForFile,
} from "@app/components/shared/useWorkspaceFolder";
import { readDiskFile } from "@app/services/localFolderContents";
import { WorkspaceFolderList } from "@app/components/shared/WorkspaceFolderList";
import {
  useOpenWorkspaceFolder,
  useRemoveWorkspaceFolder,
} from "@app/hooks/useOpenWorkspaceFolder";
import { useNewFolderFlow } from "@app/hooks/useNewFolderFlow";
import { canPickDirectory } from "@app/services/directoryPicker";
import "@app/components/shared/FileSidebar.css";

// Shared with the processor sidebar via tokens, so the two cannot drift.
const SIDEBAR_WIDTH = "var(--sidebar-w)";

// Stable empty props for rows without policies, so the memoized
// FileItem isn't re-rendered by a fresh `?? []` identity on every list render.
const NO_POLICIES: never[] = [];

/** Show pre-dispatch progress only for large drops; small imports finish before it paints. */
const BULK_ADD_INDICATOR_MIN = 8;

export interface FileSidebarProps {
  onOpenSettings?: () => void;
  /** The quick nav rail owns the account control, so the footer drops its own row. */
  accountHoisted?: boolean;
  /** Override the Open-from-computer handler (e.g. upload to /files folder). */
  onUploadFiles?: (files: File[]) => void | Promise<void>;
  /** Publishes the sidebar's picker so the quick navigation rail can reuse it. */
  onRegisterOpenFromComputer?: (open: (() => void) | null) => void;
  /** Override the Google Drive handler. */
  onPickGoogleDriveFiles?: (files: File[]) => void | Promise<void>;
  /** Action rows inserted under Open-from-computer (New folder, Refresh). A
   *  control with more than one destination renders itself instead. */
  extraActions?: Array<{
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    disabledTooltip?: string;
    testId?: string;
    render?: () => React.ReactNode;
  }>;
}

/** Isolates per-file progress updates from the sidebar's file-list renders. */
function BulkAddProgressRow() {
  const { t } = useTranslation();
  const bulkAdd = useBulkAddProgress();
  if (bulkAdd.total < BULK_ADD_INDICATOR_MIN || bulkAdd.done >= bulkAdd.total) {
    return null;
  }
  return (
    <div className="file-sidebar-bulk-add" role="status" aria-live="polite">
      <div className="file-sidebar-bulk-add-label">
        <span>{t("fileSidebar.addingFiles", "Adding files…")}</span>
        <span className="file-sidebar-bulk-add-count">
          {bulkAdd.done}/{bulkAdd.total}
        </span>
      </div>
      <div className="file-sidebar-bulk-add-track">
        <div
          className="file-sidebar-bulk-add-bar"
          style={{
            width: `${Math.round((bulkAdd.done / bulkAdd.total) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

/** Isolates library-state subscriptions from the sidebar used by every workspace. */
function FolderTreeSection() {
  const filesPage = useFilesPage();
  return (
    <div className="file-sidebar-folders-section sidebar-content-fade">
      <FolderTreeSidebar
        fileCounts={filesPage.fileCountsByFolder}
        onRequestNewFolder={filesPage.openNewFolderDialog}
        onRenameFolder={(folder: FolderRecord) =>
          filesPage.openRenameFolderDialog(folder)
        }
        onDeleteFolder={filesPage.promptDeleteFolder}
        onMoveFilesIntoFolder={async (
          targetId: FolderId | null,
          fileIds: FileId[],
        ) => {
          if (fileIds.length === 0) return;
          await filesPage.moveFilesTo(fileIds, targetId);
        }}
      />
    </div>
  );
}

type SidebarAction = NonNullable<FileSidebarProps["extraActions"]>[number];

function SidebarActionRow({ action }: { action: SidebarAction }) {
  if (action.render) return <>{action.render()}</>;
  const explainsDisabled = Boolean(action.disabled && action.disabledTooltip);
  return (
    <Tooltip
      label={action.disabledTooltip ?? action.label}
      position="right"
      withinPortal
      multiline={explainsDisabled}
      w={explainsDisabled ? 220 : undefined}
      // The tooltip explains why an already-labelled action is disabled.
      disabled={!explainsDisabled}
    >
      <div
        className={`file-sidebar-action-row${action.disabled ? " disabled" : ""}`}
        data-testid={action.testId}
        onClick={() => {
          if (action.disabled) return;
          action.onClick();
        }}
        role="button"
        tabIndex={action.disabled ? -1 : 0}
        aria-disabled={action.disabled}
        aria-label={action.label}
        onKeyDown={(e) => {
          if (action.disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            action.onClick();
          }
        }}
      >
        <span className="file-sidebar-action-icon">{action.icon}</span>
        <span className="file-sidebar-action-label sidebar-content-fade">
          {action.label}
        </span>
      </div>
    </Tooltip>
  );
}

function FileDropOverlay({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <div className="file-sidebar-drop-overlay" aria-hidden="true">
      <Icon name="file-up" className="file-sidebar-drop-overlay-icon" />
      <span className="file-sidebar-drop-overlay-text">
        {t("fileSidebar.dropToAdd", "Drop files to add")}
      </span>
    </div>
  );
}

const FileSidebar = forwardRef<HTMLDivElement, FileSidebarProps>(
  function FileSidebar(
    {
      onOpenSettings,
      accountHoisted = false,
      onUploadFiles,
      onRegisterOpenFromComputer,
      onPickGoogleDriveFiles,
      extraActions,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const labelName = useLabelName();
    // Classification off (non-SaaS / AI-off) → never show the per-row label chip,
    // even if a stub carries labels from an imported PDF; keeps the row plain.
    const classificationEnabled = useClassificationEnabled();
    const nativeFileInputRef = useRef<HTMLInputElement>(null);
    // State schedules the viewer transition after the file enters the workspace.
    const [pendingViewFileId, setPendingViewFileId] = useState<string | null>(
      null,
    );

    const { config } = useAppConfig();
    const {
      isEnabled: isGoogleDriveEnabled,
      openPicker: openGoogleDrivePicker,
    } = useGoogleDrivePicker();
    const { state } = useFileState();
    const { fileColorIndexMap } = usePageEditor();
    const selectors = useFileSelectors();
    const { actions: fileActions } = useFileActions();
    const { actions: navActions } = useNavigationActions();
    const { workbench: currentWorkbench, selectedTool } = useNavigationState();
    const policyFileBadges = usePolicyFileBadges();
    const isMultiTool =
      currentWorkbench === "pageEditor" && selectedTool === "multiTool";
    const { requestNavigation } = useNavigationGuard();
    const { activeFileId, setActiveFileId } = useViewer();
    const { addFiles } = useFileHandler();
    const indexedDB = useIndexedDB();

    const { displayName, profilePictureUrl, isAnonymous } =
      useAccountIdentity();
    const credits = useFreeCreditsSummary();
    const openPlan = useOpenPlan();

    const [allFileStubs, setAllFileStubs] = useState<StirlingFileStub[]>([]);
    const workspaceFolder = useWorkspaceFolder(allFileStubs);
    const openWorkspaceFolder = useOpenWorkspaceFolder();
    const removeWorkspaceFolder = useRemoveWorkspaceFolder(
      workspaceFolder.selected,
    );
    const { addLocalFolder } = useNewFolderFlow();
    const { recentWorkspaceFiles, rememberWorkspaceFile } = useFilesPage();
    const folderScopeRef = useRef(workspaceFolder.selected);
    const fileViewRequest = useRef(0);
    folderScopeRef.current = workspaceFolder.selected;
    const recentFiles = useMemo(() => {
      const byId = new Map(allFileStubs.map((file) => [file.id, file]));
      const recent = recentWorkspaceFiles
        .map((id) => byId.get(id))
        .filter((file): file is StirlingFileStub => Boolean(file));
      const seen = new Set(recent.map((file) => file.id));
      return [
        ...recent,
        ...allFileStubs.filter((file) => !seen.has(file.id)),
      ].slice(0, 5);
    }, [allFileStubs, recentWorkspaceFiles]);
    useEffect(() => {
      if (
        activeFileId &&
        workspaceFolder.stubs.some((file) => file.id === activeFileId)
      ) {
        rememberWorkspaceFile(workspaceFolder.selected, activeFileId as FileId);
      }
    }, [
      activeFileId,
      workspaceFolder.stubs,
      workspaceFolder.selected,
      rememberWorkspaceFile,
    ]);
    // Keep unreadable records so a reload can retry their bytes.
    const [lostFileIds, setLostFileIds] = useState<ReadonlySet<string>>(
      () => new Set(),
    );
    useEffect(
      () =>
        onRecordUnreadable((fileId) =>
          setLostFileIds((prev) => new Set(prev).add(fileId)),
        ),
      [],
    );
    const [stubsLoaded, setStubsLoaded] = useState(false);
    const [saveToServerTarget, setSaveToServerTarget] = useState<
      StirlingFileStub[] | null
    >(null);
    const [versionHistoryTarget, setVersionHistoryTarget] =
      useState<StirlingFileStub | null>(null);
    // Kebab "Delete" target when the file is on the cloud; drives the
    // local/cloud/both choice dialog. Local-only files delete immediately.
    const [deleteTarget, setDeleteTarget] = useState<StirlingFileStub | null>(
      null,
    );
    const [renameTarget, setRenameTarget] = useState<StirlingFileStub | null>(
      null,
    );
    // Storage gate: only offer Save-to-cloud when the server allows it and
    // the user is signed in (guests have no cloud library).
    const storageEnabled = config?.storageEnabled === true && !isAnonymous;

    // Only the newest read may publish: coalesced refreshes overlap when a scan
    // outlasts the window, and a slow one finishing last would otherwise
    // overwrite the newer library with the state it started from.
    const stubsGenRef = useRef(0);
    const refreshStubs = useCallback(async () => {
      const gen = ++stubsGenRef.current;
      // `stubsLoaded` gates the spinner, so the `finally` below must set it on
      // every path - callers never await this, so a rejection goes nowhere.
      let stubs: StirlingFileStub[] = [];
      try {
        stubs = await indexedDB.loadLeafMetadata();
      } catch (error) {
        // Carry on with the in-memory workbench files: an unreadable library
        // should cost the user their history, not the file they're working on.
        console.error("Failed to read the file library from storage:", error);
      }
      if (gen !== stubsGenRef.current) return;

      try {
        const idbIds = new Set(stubs.map((s) => s.id as string));

        const pendingStubs = state.files.ids
          .map((id) => state.files.byId[id])
          .filter(
            (stub): stub is NonNullable<typeof stub> =>
              !!stub && stub.isLeaf !== false && !idbIds.has(stub.id as string),
          );

        const allStubs = [...stubs, ...pendingStubs];
        // During a version swap, drop the superseded IDB leaf to avoid duplicate lineage keys.
        const superseded = new Set(
          allStubs.map((s) => s.parentFileId as string | undefined),
        );
        const currentStubs = allStubs.filter(
          (s) => !superseded.has(s.id as string),
        );
        setAllFileStubs(
          currentStubs.sort(
            (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
          ),
        );
      } finally {
        if (gen === stubsGenRef.current) setStubsLoaded(true);
      }
    }, [indexedDB, state.files.ids, state.files.byId]);

    const indexedDBRevision = useIndexedDBRevision();
    useCoalescedCallback(refreshStubs, indexedDBRevision);

    // The hook cancels timers but cannot cancel a started run, so unmount has to
    // invalidate it here or a late scan would publish into a gone tree.
    useEffect(() => {
      return () => {
        stubsGenRef.current++;
      };
    }, []);

    // Server copies require a deletion-scope choice; local-only files delete immediately.
    const handleSidebarDelete = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        const hasCloud =
          !!stub &&
          typeof stub.remoteStorageId === "number" &&
          stub.remoteOwnedByCurrentUser === true;
        if (hasCloud && stub) {
          setDeleteTarget(stub);
          return;
        }
        // Its superseded versions go too - see orphanedAncestorIds.
        const orphans = await fileStorage.orphanedAncestorIds([fileId]);
        await fileActions.removeFiles([fileId, ...orphans], true);
        await refreshStubs();
      },
      [allFileStubs, fileActions, refreshStubs],
    );

    const handleConfirmSidebarDelete = useCallback(
      async (scope: DeleteScope) => {
        const stub = deleteTarget;
        if (!stub) return;
        if (
          (scope === "cloud" || scope === "everywhere") &&
          typeof stub.remoteStorageId === "number" &&
          stub.remoteOwnedByCurrentUser === true
        ) {
          await deleteServerFile(stub.remoteStorageId);
        }
        if (scope === "device" || scope === "everywhere") {
          const orphans = await fileStorage.orphanedAncestorIds([stub.id]);
          await fileActions.removeFiles([stub.id, ...orphans], true);
        } else if (scope === "cloud") {
          // Local copy kept - drop the dead remote pointer so the cloud badge
          // clears (the sidebar doesn't reconcile with the server itself).
          const cleared = {
            remoteStorageId: undefined,
            remoteStorageUpdatedAt: undefined,
            remoteOwnedByCurrentUser: undefined,
            remoteSharedViaLink: false,
            remoteHasShareLinks: undefined,
          };
          fileActions.updateStirlingFileStub(stub.id, cleared);
          await fileStorage.updateFileMetadata(stub.id, cleared);
        }
        setDeleteTarget(null);
        await refreshStubs();
      },
      [deleteTarget, fileActions, refreshStubs],
    );

    const handleSaveToCloud = useCallback(
      (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub) setSaveToServerTarget([stub]);
      },
      [allFileStubs],
    );

    const handleVersionHistory = useCallback(
      (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub) setVersionHistoryTarget(stub);
      },
      [allFileStubs],
    );

    const warnDataUnavailable = useCallback(() => {
      alert({
        alertType: "warning",
        title: t("fileSidebar.dataLostTitle", "File data is unavailable"),
        body: t(
          "fileSidebar.dataLostBody",
          "This browser lost this file's contents. Upload it again to keep working with it.",
        ),
        expandable: false,
        durationMs: 6000,
      });
    }, [t]);

    // Kebab: download a copy (desktop saves via the native dialog). Routed
    // through the policy wrapper so export policies enforce here too.
    const handleDownload = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        const file = await fileStorage.getStirlingFile(fileId);
        if (!file) {
          warnDataUnavailable();
          return;
        }
        try {
          await downloadFileWithPolicy({
            data: file,
            filename: stub?.name ?? file.name,
            fileId: fileId,
          });
        } catch (error) {
          console.error("[FileSidebar] Download failed:", error);
          alert({
            alertType: "error",
            title: t("fileSidebar.downloadFailed", "Download failed"),
            body: error instanceof Error ? error.message : String(error),
            expandable: false,
          });
        }
      },
      [allFileStubs, warnDataUnavailable, t],
    );

    const handleDuplicate = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (!stub) return;
        try {
          const copyId = await duplicateStoredFile(
            stub,
            allFileStubs.map((s) => s.name),
            addFiles,
          );
          if (!copyId) {
            warnDataUnavailable();
            return;
          }
          await refreshStubs();
        } catch (error) {
          console.error("[FileSidebar] Duplicate failed:", error);
          alert({
            alertType: "error",
            title: t("fileSidebar.duplicateFailed", "Could not duplicate file"),
            body: error instanceof Error ? error.message : String(error),
            expandable: false,
          });
        }
      },
      [allFileStubs, addFiles, refreshStubs, warnDataUnavailable, t],
    );

    const handleRename = useCallback(
      (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub) setRenameTarget(stub);
      },
      [allFileStubs],
    );

    // Persist the rename before updating the open workspace copy.
    const handleConfirmRename = useCallback(
      async (name: string) => {
        const stub = renameTarget;
        if (!stub) return;
        // quickKey is name|size|lastModified; a stale one would make a re-upload
        // of the original look like a duplicate of the renamed file.
        const quickKey = `${name}|${stub.size}|${stub.lastModified}`;
        const saved = await fileStorage.updateFileMetadata(stub.id, {
          name,
          quickKey,
        });
        if (!saved) {
          throw new Error(
            t("fileSidebar.rename.error", "Could not rename the file."),
          );
        }
        fileActions.updateStirlingFileStub(stub.id, { name, quickKey });
        setRenameTarget(null);
        await refreshStubs();
      },
      [renameTarget, fileActions, refreshStubs, t],
    );

    // Desktop-only; a no-op stub on web, where this stays hidden.
    const { canOpenInNewWindow, openInNewWindow } = useOpenInNewWindow();
    const handleOpenInNewWindow = useCallback(
      (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub) openInNewWindow(stub);
      },
      [allFileStubs, openInNewWindow],
    );

    useEffect(() => {
      if (!pendingViewFileId) return;
      const isInWorkbench = state.files.ids.some(
        (id) => (id as string) === pendingViewFileId,
      );
      if (isInWorkbench) {
        setPendingViewFileId(null);
        setActiveFileId(pendingViewFileId);
        navActions.restoreWorkbench("viewer");
      }
    }, [pendingViewFileId, state.files.ids, setActiveFileId, navActions]);

    // SaaS groups by classification label; core returns null → one flat, recency-sorted list.
    const selectedIds = useMemo(
      () => new Set(state.ui.selectedFileIds),
      [state.ui.selectedFileIds],
    );
    const workbenchIds = useMemo(
      () => new Set(state.files.ids.map((id) => id as string)),
      [state.files.ids],
    );
    // How many rendered stubs share each lineage — >1 means split siblings, which
    // must key by their unique leaf id rather than the shared lineage (see renderFileRow).
    const lineageCounts = useMemo(() => {
      const counts = new Map<string, number>();
      for (const s of allFileStubs) {
        const k = s.originalFileId ?? s.id;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return counts;
    }, [allFileStubs]);

    const handleGoogleDriveClick = useCallback(async () => {
      if (!isGoogleDriveEnabled) return;
      const files = await openGoogleDrivePicker({ multiple: true });
      if (files.length === 0) return;
      if (onPickGoogleDriveFiles) {
        await onPickGoogleDriveFiles(files);
        return;
      }
      const added = await addFiles(files);
      if (!isMultiTool && added[0]) {
        setPendingViewFileId(added[0].fileId);
      }
    }, [
      isGoogleDriveEnabled,
      openGoogleDrivePicker,
      addFiles,
      navActions,
      isMultiTool,
      onPickGoogleDriveFiles,
    ]);

    const handleSelectionToggle = useCallback(
      (fileId: FileId) => {
        const entry = workspaceFolder.entries.get(fileId);
        if (entry) {
          const selectDiskFile = async () => {
            try {
              const file = await readDiskFile(entry);
              if (!file) return;
              const scope = workspaceFolder.selected;
              const added = await addFiles([file], {
                selectFiles: false,
                folderId: scope || undefined,
              });
              const id = added[0]?.fileId;
              if (id && folderScopeRef.current === scope) {
                const selected = selectors
                  .getSelectedStirlingFileStubs()
                  .map((stub) => stub.id);
                fileActions.setSelectedFiles([...new Set([...selected, id])]);
              }
            } catch (error) {
              alert({
                alertType: "error",
                title: entry.name,
                body: error instanceof Error ? error.message : String(error),
              });
            }
          };
          requestNavigation(() => {
            void selectDiskFile();
          });
          return;
        }
        const stub = allFileStubs.find((file) => file.id === fileId);
        if (!stub || stub.dataUnavailable || lostFileIds.has(fileId)) return;
        const toggle = async () => {
          const scope = workspaceFolder.selected;
          if (!state.files.ids.includes(fileId)) {
            await fileActions.addStirlingFileStubs([stub], {
              selectFiles: false,
            });
          }
          // Read after hydration: rapid checkbox clicks must not overwrite each other.
          if (folderScopeRef.current !== scope) return;
          const selection = selectors
            .getSelectedStirlingFileStubs()
            .map((file) => file.id);
          fileActions.setSelectedFiles(
            selection.includes(fileId)
              ? selection.filter((id) => id !== fileId)
              : [...selection, fileId],
          );
        };
        if (currentWorkbench === "pageEditor")
          requestNavigation(() => {
            void toggle();
          });
        else void toggle();
      },
      [
        allFileStubs,
        lostFileIds,
        state.files.ids,
        fileActions,
        selectors,
        currentWorkbench,
        requestNavigation,
        workspaceFolder.entries,
        workspaceFolder.selected,
        addFiles,
      ],
    );

    const viewedWorkbenchId =
      currentWorkbench === "viewer" ? activeFileId : null;

    const handleFileClick = useCallback(
      (fileId: FileId) => {
        const entry = workspaceFolder.entries.get(fileId);
        if (entry) {
          requestNavigation(() => {
            const request = ++fileViewRequest.current;
            void (async () => {
              try {
                const file = await readDiskFile(entry);
                if (!file) return;
                const scope = workspaceFolder.selected;
                const added = await addFiles([file], {
                  selectFiles: false,
                  folderId: scope || undefined,
                });
                if (
                  added[0] &&
                  folderScopeRef.current === scope &&
                  fileViewRequest.current === request
                )
                  setPendingViewFileId(added[0].fileId);
              } catch (error) {
                alert({
                  alertType: "error",
                  title: entry.name,
                  body: error instanceof Error ? error.message : String(error),
                });
              }
            })();
          });
          return;
        }
        const stub = allFileStubs.find((file) => file.id === fileId);
        if (!stub || stub.dataUnavailable || lostFileIds.has(fileId)) return;
        if (viewedWorkbenchId === fileId) return;
        requestNavigation(() => {
          const request = ++fileViewRequest.current;
          const target = workspaceFolder.stubs.some(
            (file) => file.id === stub.id,
          )
            ? workspaceFolder.selected
            : workspaceFolderForFile(stub, workspaceFolder.allChoices);
          if (target !== workspaceFolder.selected) {
            folderScopeRef.current = target;
            workspaceFolder.setChosen(target);
            fileActions.setSelectedFiles([]);
          }
          void (async () => {
            await fileActions.addStirlingFileStubs([stub], {
              selectFiles: false,
            });
            if (
              folderScopeRef.current === target &&
              fileViewRequest.current === request
            )
              setPendingViewFileId(fileId);
          })();
        });
      },
      [
        allFileStubs,
        lostFileIds,
        viewedWorkbenchId,
        requestNavigation,
        fileActions,
        workspaceFolder.entries,
        workspaceFolder.selected,
        workspaceFolder.allChoices,
        workspaceFolder.setChosen,
        workspaceFolder.stubs,
        addFiles,
      ],
    );

    // Shared ingest path for both the native picker and drag-and-drop.
    // Per-tool validation happens downstream.
    const ingestFiles = useCallback(
      async (files: File[]) => {
        if (files.length === 0) return;
        if (onUploadFiles) {
          await onUploadFiles(files);
        } else {
          const added = await addFiles(files);
          // A tool that pinned its own workbench surface owns it - switching to
          // the viewer here strands the upload outside the tool being used.
          if (!isMultiTool && !currentWorkbench.startsWith("custom:")) {
            if (added[0]) setPendingViewFileId(added[0].fileId);
          }
        }
      },
      [addFiles, navActions, isMultiTool, onUploadFiles, currentWorkbench],
    );

    const handleNativeFilePick = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        await ingestFiles(Array.from(e.target.files ?? []));
        e.target.value = "";
      },
      [ingestFiles],
    );

    const openNativeFilePicker = useCallback(() => {
      void openFilesFromDisk({
        onFallbackOpen: () => nativeFileInputRef.current?.click(),
      })
        .then(ingestFiles)
        .catch((err) => {
          console.error("[FileSidebar] Native file pick failed", err);
          alert({
            alertType: "error",
            title: t("fileSidebar.uploadFailedTitle", "Upload failed"),
            body:
              err instanceof Error
                ? err.message
                : t(
                    "fileSidebar.uploadFailedBody",
                    "Could not add the selected files.",
                  ),
            isPersistentPopup: false,
          });
        });
    }, [ingestFiles, t]);

    useEffect(() => {
      if (!onRegisterOpenFromComputer) return;
      onRegisterOpenFromComputer(openNativeFilePicker);
      return () => onRegisterOpenFromComputer(null);
    }, [onRegisterOpenFromComputer, openNativeFilePicker]);

    // Internal folder drags have their own payloads and must bypass file ingestion.
    const [isFileDragOver, setIsFileDragOver] = useState(false);
    const dragDepth = useRef(0);

    const isNativeFileDrag = (e: React.DragEvent) =>
      Array.from(e.dataTransfer.types).includes("Files");

    const handleDragEnter = useCallback((e: React.DragEvent) => {
      if (!isNativeFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setIsFileDragOver(true);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      if (!isNativeFileDrag(e)) return;
      // Required so the browser fires `drop` rather than opening the file.
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      if (!isNativeFileDrag(e)) return;
      // dragenter/leave fire per child element; the counter keeps the overlay
      // stable until the cursor genuinely leaves the sidebar.
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsFileDragOver(false);
      }
    }, []);

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        if (!isNativeFileDrag(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setIsFileDragOver(false);
        await ingestFiles(Array.from(e.dataTransfer.files ?? []));
      },
      [ingestFiles],
    );

    const eligibleFileIds = useToolEligibleFileIds();

    const renderFileRow = (stub: StirlingFileStub) => {
      const listedOnDisk = workspaceFolder.entries.has(stub.id);
      const isInWorkbench = workbenchIds.has(stub.id);
      const isSelected = selectedIds.has(stub.id);
      const workbenchFileId = isInWorkbench ? stub.id : undefined;
      const isViewedInViewer = !!(
        viewedWorkbenchId && viewedWorkbenchId === (stub.id as string)
      );
      const isActive = isViewedInViewer;
      const isEncryptedFile = stub.processedFile?.isEncrypted === true;
      const thumbnailUrl = isEncryptedFile
        ? undefined
        : (workbenchFileId
            ? state.files.byId[workbenchFileId]?.thumbnailUrl
            : undefined) || stub.thumbnailUrl;
      const fileOrigin = getFileOrigin(stub);
      const dataUnavailable =
        stub.dataUnavailable === true || lostFileIds.has(stub.id);
      // Lineage keys preserve rows across version changes; split siblings need unique leaf IDs.
      const lineageKey = stub.originalFileId ?? stub.id;
      const rowKey =
        (lineageCounts.get(lineageKey) ?? 0) > 1
          ? (stub.id as string)
          : lineageKey;
      return (
        <FileItem
          isToolSkipped={
            (isSelected || isViewedInViewer) &&
            eligibleFileIds !== null &&
            !eligibleFileIds.has(stub.id)
          }
          key={rowKey}
          fileId={stub.id}
          name={stub.name}
          size={stub.size}
          lastModified={stub.lastModified}
          isSelected={isSelected}
          fileColorIndex={fileColorIndexMap.get(stub.id)}
          isActive={isActive}
          isViewedInViewer={isViewedInViewer}
          thumbnailUrl={thumbnailUrl}
          onClick={handleFileClick}
          onSelectionToggle={handleSelectionToggle}
          dataUnavailable={dataUnavailable}
          policies={policyFileBadges.get(stub.id) ?? NO_POLICIES}
          onDelete={listedOnDisk ? undefined : handleSidebarDelete}
          onDownload={listedOnDisk ? undefined : handleDownload}
          onRename={listedOnDisk ? undefined : handleRename}
          onDuplicate={listedOnDisk ? undefined : handleDuplicate}
          onOpenInNewWindow={
            !listedOnDisk && canOpenInNewWindow(stub)
              ? handleOpenInNewWindow
              : undefined
          }
          onSaveToCloud={handleSaveToCloud}
          canSaveToCloud={storageEnabled && fileOrigin !== "shared-with-me"}
          isUploadedToCloud={fileOrigin === "cloud"}
          onVersionHistory={handleVersionHistory}
          hasVersionHistory={(stub.versionNumber ?? 1) > 1}
          primaryLabel={
            classificationEnabled && stub.classificationLabels?.[0]
              ? labelName(stub.classificationLabels[0])
              : undefined
          }
        />
      );
    };

    const sidebarActions: NonNullable<FileSidebarProps["extraActions"]> = [
      ...(currentWorkbench === "myFiles"
        ? [
            {
              icon: <Icon name="plus" />,
              label: t("fileSidebar.addFiles", "Add files"),
              onClick: openNativeFilePicker,
              testId: "pdf-library-add-files",
            },
            ...(isGoogleDriveEnabled
              ? [
                  {
                    icon: <Icon name="googledrive" />,
                    label: t(
                      "fileSidebar.googleDrive",
                      "Open from Google Drive",
                    ),
                    onClick: () => void handleGoogleDriveClick(),
                    testId: "google-drive-button",
                  },
                ]
              : []),
          ]
        : []),
      ...(extraActions ?? []),
    ];

    return (
      <div
        ref={ref}
        className="file-sidebar"
        style={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          maxWidth: SIDEBAR_WIDTH,
        }}
        data-sidebar="file-sidebar"
        data-tour="quick-access-bar"
        data-file-drag-over={isFileDragOver || undefined}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FileDropOverlay show={isFileDragOver} />
        <div className="file-sidebar-inner">
          <input
            ref={nativeFileInputRef}
            type="file"
            multiple
            // The global workspace accepts all formats for conversion, merging and extraction.
            style={{ display: "none" }}
            onChange={handleNativeFilePick}
            data-testid="file-input"
          />

          <NavSurface
            className="file-sidebar-controls"
            hidden={sidebarActions.length === 0}
          >
            {sidebarActions.map((action) => (
              <SidebarActionRow key={action.label} action={action} />
            ))}
          </NavSurface>

          <NavSurface className="file-sidebar-files-box">
            <div className="file-sidebar-scroll">
              <BulkAddProgressRow />
              {currentWorkbench === "myFiles" ? (
                <FolderTreeSection />
              ) : (
                <WorkspaceFolderList
                  folders={workspaceFolder.choices}
                  selected={workspaceFolder.selected}
                  files={workspaceFolder.stubs}
                  recent={recentFiles}
                  loading={!stubsLoaded || workspaceFolder.loading}
                  selectedCount={
                    workspaceFolder.stubs.filter((file) =>
                      selectedIds.has(file.id),
                    ).length
                  }
                  renderFile={renderFileRow}
                  onFolder={openWorkspaceFolder}
                  onRemoveFolder={(folder) => removeWorkspaceFolder(folder.id)}
                  onRecent={(file) => handleFileClick(file.id)}
                  onOpenFolder={
                    canPickDirectory ? () => void addLocalFolder() : undefined
                  }
                  onAddFiles={openNativeFilePicker}
                  onManage={() => navActions.setWorkbench("myFiles")}
                />
              )}
            </div>
          </NavSurface>
        </div>

        <BulkUploadToServerModal
          opened={Boolean(saveToServerTarget && saveToServerTarget.length > 0)}
          onClose={() => setSaveToServerTarget(null)}
          files={saveToServerTarget ?? []}
          onUploaded={refreshStubs}
        />

        <VersionHistoryModal
          opened={Boolean(versionHistoryTarget)}
          onClose={() => setVersionHistoryTarget(null)}
          file={versionHistoryTarget}
          onChanged={refreshStubs}
        />

        <RenameFileDialog
          opened={Boolean(renameTarget)}
          fileName={renameTarget?.name ?? ""}
          onClose={() => setRenameTarget(null)}
          onSubmit={handleConfirmRename}
        />

        <DeleteFilesDialog
          opened={Boolean(deleteTarget)}
          files={deleteTarget ? [deleteTarget] : []}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmSidebarDelete}
        />

        <SidebarChecklistSlot />
        <NavFooter
          className="file-sidebar-footer-box"
          displayName={displayName}
          profilePictureUrl={profilePictureUrl}
          onOpenSettings={onOpenSettings}
          showAccount={!accountHoisted}
          credits={credits}
          onOpenPlan={openPlan ?? undefined}
        />
      </div>
    );
  },
);

export default FileSidebar;
