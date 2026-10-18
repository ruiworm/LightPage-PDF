import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FocusTrap, Overlay, Tooltip } from "@mantine/core";
import { useFocusReturn } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import "@app/components/layout/CompactWorkspace.css";

const WorkspacePanels = createContext<{
  files: () => void;
  tools: (() => void) | null;
} | null>(null);

function WorkspacePanel({
  compact,
  shown,
  side,
  label,
  onClose,
  children,
}: {
  compact: boolean;
  shown: boolean;
  side: "files" | "tools";
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const modal = compact && shown;
  useFocusReturn({ opened: modal });
  return (
    <FocusTrap active={modal}>
      <aside
        hidden={!shown}
        className={`workspace-panel workspace-panel--${side}${compact ? " compact-workspace-panel" : ""}`}
        role={compact ? "dialog" : "complementary"}
        aria-modal={modal || undefined}
        aria-label={label}
        onKeyDown={(event) => {
          if (
            modal &&
            event.key === "Escape" &&
            !event.defaultPrevented &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            onClose();
          }
        }}
      >
        {compact && (
          <div className="workspace-panel__header">
            <h2>{label}</h2>
            <ActionIcon
              variant="quiet"
              onClick={onClose}
              aria-label={t("close", "Close")}
            >
              <Icon name="x" size={20} />
            </ActionIcon>
          </div>
        )}
        <div className="workspace-panel__body">{children}</div>
      </aside>
    </FocusTrap>
  );
}

interface CompactWorkspaceProps {
  compact: boolean;
  active?: boolean;
  children: ReactNode;
  files: ReactNode;
  tools: ReactNode;
  filesVisible: boolean;
  toolsVisible: boolean;
  trailing?: ReactNode;
  wingsPhase?: "leaving" | "returning" | null;
  activeFileId: string | null;
  toolKey: string | null;
  toolHasSettings: boolean;
}

/** Document and panel controllers keep their owners while viewport changes only alter their layout. */
export function CompactWorkspace({
  compact,
  active = true,
  children,
  files,
  tools,
  filesVisible,
  toolsVisible,
  trailing,
  wingsPhase,
  activeFileId,
  toolKey,
  toolHasSettings,
}: CompactWorkspaceProps) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState<"files" | "tools" | null>(null);
  const controls = useMemo(
    () => ({
      files: () => setPanel("files"),
      tools: toolsVisible ? () => setPanel("tools") : null,
    }),
    [toolsVisible],
  );
  useEffect(() => {
    setPanel(null);
  }, [activeFileId]);
  useEffect(() => {
    setPanel(toolKey && toolHasSettings ? "tools" : null);
  }, [toolKey, toolHasSettings]);
  const filesShown =
    filesVisible && (!compact || (active && panel === "files"));
  const toolsShown =
    toolsVisible && (!compact || (active && panel === "tools"));
  const modalOpen = compact && (filesShown || toolsShown);
  const close = () => setPanel(null);
  return (
    <WorkspacePanels.Provider
      value={compact && active && filesVisible ? controls : null}
    >
      <div
        className={compact ? "compact-workspace" : "workspace-panels"}
        data-wings={wingsPhase ?? undefined}
      >
        {modalOpen && <Overlay zIndex={200} onClick={close} />}
        <WorkspacePanel
          compact={compact}
          shown={filesShown}
          side="files"
          label={t("workspaceFolders.mine", "My folders")}
          onClose={close}
        >
          {files}
        </WorkspacePanel>
        {children}
        <WorkspacePanel
          compact={compact}
          shown={toolsShown}
          side="tools"
          label={t("home.mobile.tools", "Tools")}
          onClose={close}
        >
          {tools}
        </WorkspacePanel>
        {trailing}
      </div>
    </WorkspacePanels.Provider>
  );
}

/** Optional toolbar entry; wide-window toolbars render no extra control. */
export function CompactWorkspaceButton({
  panel,
}: {
  panel: "files" | "tools";
}) {
  const controls = useContext(WorkspacePanels);
  const { t } = useTranslation();
  if (!controls?.[panel]) return null;
  const label =
    panel === "files"
      ? t("workspaceFolders.mine", "My folders")
      : t("home.mobile.tools", "Tools");
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="tertiary"
        size="lg"
        onClick={controls[panel]}
        aria-label={label}
      >
        <Icon name={panel === "files" ? "folder-open" : "wrench"} size={20} />
      </ActionIcon>
    </Tooltip>
  );
}
