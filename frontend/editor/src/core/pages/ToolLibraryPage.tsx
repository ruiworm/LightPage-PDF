import { useMemo, useState } from "react";
import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useToolWorkflowData } from "@app/contexts/ToolWorkflowContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import { TextInput } from "@app/components/shared/TextInput";
import { ToolIcon } from "@app/components/shared/ToolIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useSidebarTools } from "@app/hooks/tools/useSidebarTools";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { filterToolRegistryByQuery } from "@app/utils/toolSearch";
import { SubcategoryId, type ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import {
  getToolDisabledReason,
  resolveDisabledMessage,
} from "@app/components/tools/fullscreen/shared";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { Icon } from "@app/ui/Icon";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import type { ToolId } from "@app/types/toolId";
import "@app/pages/ToolLibraryPage.css";

const LIBRARY_GROUPS = [
  { id: "editing", title: "Content editing" },
  { id: "pages", title: "Page organization" },
  { id: "conversion", title: "Conversion & optimization" },
  { id: "security", title: "Security & signatures" },
] as const;
type LibraryGroupId = (typeof LIBRARY_GROUPS)[number]["id"];
const TOOL_GROUPS: Partial<Record<ToolId, LibraryGroupId>> = {
  merge: "pages",
  multiTool: "pages",
  compress: "conversion",
  convert: "conversion",
  ocr: "conversion",
  redact: "security",
  removePassword: "security",
};
const SUBCATEGORY_GROUPS: Record<SubcategoryId, LibraryGroupId> = {
  [SubcategoryId.AI]: "editing",
  [SubcategoryId.GENERAL]: "editing",
  [SubcategoryId.DOCUMENT_REVIEW]: "editing",
  [SubcategoryId.PAGE_FORMATTING]: "pages",
  [SubcategoryId.ADVANCED_FORMATTING]: "pages",
  [SubcategoryId.REMOVAL]: "pages",
  [SubcategoryId.EXTRACTION]: "conversion",
  [SubcategoryId.AUTOMATION]: "conversion",
  [SubcategoryId.DEVELOPER_TOOLS]: "conversion",
  [SubcategoryId.SIGNING]: "security",
  [SubcategoryId.DOCUMENT_SECURITY]: "security",
  [SubcategoryId.VERIFICATION]: "security",
};

export default function ToolLibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestNavigation } = useNavigationGuard();
  const { preferences, updatePreference } = usePreferences();
  const { toolRegistry, toolAvailability } = useToolWorkflowData();
  const { config } = useAppConfig();
  const { sidebarToolIds, toggleSidebarTool } = useSidebarTools();
  const [searchQuery, setSearchQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const filteredTools = useMemo(
    () => filterToolRegistryByQuery(toolRegistry, searchQuery, false),
    [toolRegistry, searchQuery],
  );
  const libraryGroups = useMemo(
    () =>
      LIBRARY_GROUPS.map((group) => ({
        ...group,
        tools: filteredTools
          .filter(
            ({ item: [id, tool] }) =>
              (TOOL_GROUPS[id] ?? SUBCATEGORY_GROUPS[tool.subcategoryId]) ===
              group.id,
          )
          .map(({ item: [id, tool] }) => ({ id, tool })),
      })).filter((group) => group.tools.length > 0),
    [filteredTools],
  );
  const groups = searchQuery.trim()
    ? filteredTools.length
      ? [
          {
            id: "search",
            title: t("toolLibrary.searchResults", "Search results"),
            tools: filteredTools.map(({ item: [id, tool] }) => ({ id, tool })),
          },
        ]
      : []
    : libraryGroups.map((group) => ({
        ...group,
        title: t(`toolLibrary.groups.${group.id}`, group.title),
      }));
  const title = t("toolLibrary.title", "Tool library");
  useDocumentMeta({ title: `${title} - LightPage PDF` });

  const renderTool = (id: ToolId, tool: ToolRegistryEntry) => {
    const added = sidebarToolIds.includes(id);
    const disabledReason = getToolDisabledReason(
      id,
      tool,
      toolAvailability,
      config?.premiumEnabled,
    );
    const unavailable = disabledReason !== null;
    const actionLabel = added
      ? t("toolLibrary.removeTool", "Remove {{name}} from sidebar", {
          name: tool.name,
        })
      : t("toolLibrary.addTool", "Add {{name}} to sidebar", {
          name: tool.name,
        });
    return (
      <article
        key={id}
        className="tool-library__tool"
        data-testid={`library-tool-${id}`}
      >
        <div className="tool-library__tool-heading">
          <span className="tool-library__icon" aria-hidden="true">
            <ToolIcon icon={tool.icon} marginRight="0" color="currentColor" />
          </span>
          <h3>{tool.name}</h3>
          <Tooltip
            content={
              added ? actionLabel : t("toolLibrary.add", "Add to sidebar")
            }
            position="top"
          >
            <ActionIcon
              className="tool-library__toggle"
              variant={added ? "tertiary" : "secondary"}
              accent={added ? "neutral" : "default"}
              size="md"
              aria-label={actionLabel}
              aria-pressed={added}
              disabled={unavailable && !added}
              onClick={() => {
                toggleSidebarTool(id);
                setAnnouncement(
                  added
                    ? t(
                        "toolLibrary.removed",
                        "Removed {{name}} from sidebar",
                        {
                          name: tool.name,
                        },
                      )
                    : t("toolLibrary.added", "Added {{name}} to sidebar", {
                        name: tool.name,
                      }),
                );
              }}
            >
              <Icon name={added ? "check" : "plus"} size="1rem" />
            </ActionIcon>
          </Tooltip>
        </div>
        {preferences.showLegacyToolDescriptions && (
          <p className="tool-library__description">{tool.description}</p>
        )}
        {unavailable && (
          <p className="tool-library__unavailable">
            {resolveDisabledMessage(t, disabledReason, tool).replace(
              /[:：]\s*$/,
              "",
            )}
          </p>
        )}
      </article>
    );
  };

  return (
    <main className="tool-library" aria-label={title}>
      <QuickNavHostBridge
        themeMode={preferences.theme}
        onSetTheme={(mode) => updatePreference("theme", mode)}
        requestNavigation={requestNavigation}
        onGoToDefaultState={() => navigate(EDITOR_BASENAME)}
        onGoToStartupView={() => navigate(EDITOR_BASENAME)}
        onShowFileLibrary={() => navigate("/files")}
      />
      <div className="tool-library__header">
        <div className="tool-library__controls">
          <TextInput
            id="tool-library-search"
            name="tool-library-search"
            value={searchQuery}
            onChange={setSearchQuery}
            aria-label={t("toolPanel.searchTools", "Search tools")}
            placeholder={t("toolPicker.searchPlaceholder", "Search tools...")}
            icon={<Icon name="search" size="1.125rem" />}
          />
          <Switch
            checked={preferences.showLegacyToolDescriptions}
            onChange={(event) =>
              updatePreference(
                "showLegacyToolDescriptions",
                event.currentTarget.checked,
              )
            }
            labelPosition="left"
            label={t(
              "toolPanel.fullscreen.showDetails",
              "Show tool descriptions",
            )}
          />
        </div>
      </div>
      <div className="tool-library__content">
        <div className="tool-library__groups">
          {groups.length > 0 ? (
            groups.map((group) => (
              <section
                key={group.id}
                className="tool-library__group"
                aria-labelledby={`library-group-${group.id}`}
              >
                <h2 id={`library-group-${group.id}`}>
                  {group.title} <span>{group.tools.length}</span>
                </h2>
                <div
                  className={`tool-library__grid${preferences.showLegacyToolDescriptions ? "" : " tool-library__grid--compact"}`}
                >
                  {group.tools.map(({ id, tool }) => renderTool(id, tool))}
                </div>
              </section>
            ))
          ) : (
            <div className="tool-library__empty">
              <Icon name="search" size="1.75rem" />
              <h2>{t("toolLibrary.noResults", "No matching tools")}</h2>
              <p>
                {t(
                  "toolLibrary.searchHint",
                  "Try a different tool name or keyword.",
                )}
              </p>
              <Button variant="secondary" onClick={() => setSearchQuery("")}>
                {t("toolLibrary.clearSearch", "Clear search")}
              </Button>
            </div>
          )}
        </div>
      </div>
      <footer className="tool-library__footer">
        <span className="tool-library__count">
          {t("toolLibrary.sidebarCount", "{{count}} tools in sidebar", {
            count: sidebarToolIds.filter(
              (id) => toolRegistry[id] && !toolRegistry[id]?.hiddenFromToolList,
            ).length,
          })}
        </span>
      </footer>
      <span className="tool-library__announcement" role="status">
        {announcement}
      </span>
    </main>
  );
}
