import { useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  useNavigationGuard,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { RetainedView } from "@app/components/layout/RetainedView";
import { useSidebarTools } from "@app/hooks/tools/useSidebarTools";
import { filterToolRegistryByQuery } from "@app/utils/toolSearch";
import ToolButton from "@app/components/tools/toolPicker/ToolButton";
import ToolRenderer from "@app/components/tools/ToolRenderer";
import ToolSearch from "@app/components/tools/toolPicker/ToolSearch";
import { ToolPanelViewerBar } from "@app/components/tools/ToolPanelViewerBar";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import type { ToolId } from "@app/types/toolId";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import { preloadComponent } from "@app/utils/lazyWithPreload";

interface ToolPanelProps {
  onToolSelect?: (id: ToolId) => void;
  showSearch?: boolean;
}

export default function ToolPanel({
  onToolSelect,
  showSearch = false,
}: ToolPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestNavigation } = useNavigationGuard();
  const { workbench } = useNavigationState();
  const {
    leftPanelView,
    searchQuery,
    setSearchQuery,
    toolRegistry,
    selectedToolKey,
    toolAvailability,
    handleToolSelect,
    setPreviewFile,
  } = useToolWorkflow();
  const { sidebarToolIds, toggleSidebarTool } = useSidebarTools();
  const [searchExpanded, setSearchExpanded] = useState(false);
  const selectTool = onToolSelect ?? handleToolSelect;
  const showToolPicker =
    leftPanelView === "toolPicker" ||
    (selectedToolKey === "pdfTextEditor" &&
      workbench !== "custom:pdfTextEditor");
  const sidebarRegistry = useMemo(() => {
    const registry: Partial<ToolRegistry> = {};
    sidebarToolIds.forEach((id) => {
      if (toolRegistry[id] && !toolRegistry[id]?.hiddenFromToolList)
        registry[id] = toolRegistry[id];
    });
    return registry;
  }, [sidebarToolIds, toolRegistry]);
  const panelSearch = showSearch || searchExpanded;
  const tools = useMemo(
    () =>
      filterToolRegistryByQuery(
        sidebarRegistry,
        panelSearch ? searchQuery : "",
        false,
      ),
    [sidebarRegistry, panelSearch, searchQuery],
  );

  useEffect(() => {
    let cancelled = false;
    const components = sidebarToolIds
      .filter((id) => toolAvailability[id]?.available !== false)
      .map((id) => toolRegistry[id]?.component);
    const warmNext = (index: number) => {
      if (cancelled || index >= components.length) return;
      void preloadComponent(components[index])
        .catch(() => {})
        .finally(() => {
          if (!cancelled) timer = setTimeout(() => warmNext(index + 1), 120);
        });
    };
    let timer = setTimeout(() => warmNext(0), 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sidebarToolIds, toolRegistry, toolAvailability]);

  return (
    <>
      <ToolPanelViewerBar />
      {/* Retain only the PDF editor's controller; other tools still release on exit. */}
      <RetainedView
        mount={
          leftPanelView !== "toolPicker" && selectedToolKey === "pdfTextEditor"
        }
        active={
          leftPanelView !== "toolPicker" &&
          selectedToolKey === "pdfTextEditor" &&
          workbench === "custom:pdfTextEditor"
        }
      >
        <ScrollArea h="100%" className="tool-panel__active-scroll">
          <ToolRenderer
            selectedToolKey="pdfTextEditor"
            onPreviewFile={setPreviewFile}
          />
        </ScrollArea>
      </RetainedView>
      {showToolPicker ? (
        <>
          <div className="tool-panel__list-header">
            <span className="tool-panel__list-title">
              {t("toolPanel.toolsHeader", "PDF Tools")}
            </span>
            <ActionIcon
              variant="quiet"
              accent="neutral"
              size="sm"
              onClick={() => setSearchExpanded((value) => !value)}
              aria-label={t("toolPanel.searchTools", "Search tools")}
              title={t("toolPanel.searchTools", "Search tools")}
              data-testid="tool-panel-search"
            >
              <Icon name="search" size="1rem" />
            </ActionIcon>
          </div>
          {panelSearch && (
            <div className="tool-panel__search">
              <ToolSearch
                value={searchQuery}
                onChange={setSearchQuery}
                toolRegistry={sidebarRegistry}
                mode="filter"
              />
            </div>
          )}
          <div className="tool-panel__sidebar-list" data-testid="sidebar-tools">
            {tools.map(({ item: [id, tool], matchedText }) => (
              <div className="tool-panel__sidebar-row" key={id}>
                <ToolButton
                  id={id}
                  tool={tool}
                  isSelected={
                    workbench === "pageEditor" &&
                    selectedToolKey === "pdfTextEditor"
                      ? id === "multiTool"
                      : selectedToolKey === id
                  }
                  onSelect={selectTool}
                  matchedSynonym={matchedText}
                />
                <ActionIcon
                  className="tool-panel__remove-tool"
                  variant="tertiary"
                  accent="neutral"
                  size="sm"
                  aria-label={t(
                    "toolLibrary.removeTool",
                    "Remove {{name}} from sidebar",
                    { name: tool.name },
                  )}
                  title={t(
                    "toolLibrary.removeTool",
                    "Remove {{name}} from sidebar",
                    { name: tool.name },
                  )}
                  onClick={() => toggleSidebarTool(id)}
                >
                  <Icon name="x" size="0.875rem" />
                </ActionIcon>
              </div>
            ))}
            {tools.length === 0 && (
              <p className="tool-panel__sidebar-empty">
                {searchQuery.trim() && panelSearch
                  ? t("toolLibrary.noResults", "No matching tools")
                  : t(
                      "toolLibrary.sidebarEmpty",
                      "Add tools from the tool library to get started.",
                    )}
              </p>
            )}
          </div>
          <div className="tool-panel__library-link">
            <Button
              variant="tertiary"
              size="sm"
              fullWidth
              leftSection={<Icon name="plus" size="1rem" />}
              onClick={() => requestNavigation(() => navigate("/tools"))}
            >
              {t("toolLibrary.manageSidebar", "Manage sidebar tools")}
            </Button>
          </div>
        </>
      ) : selectedToolKey !== "pdfTextEditor" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea h="100%" className="tool-panel__active-scroll">
            {selectedToolKey ? (
              <ToolRenderer
                selectedToolKey={selectedToolKey}
                onPreviewFile={setPreviewFile}
              />
            ) : !selectedToolKey ? (
              <div className="tool-panel__placeholder">
                {t("toolPanel.placeholder", "Choose a tool to get started")}
              </div>
            ) : null}
          </ScrollArea>
        </div>
      ) : null}
    </>
  );
}
