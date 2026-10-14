import { useMemo } from "react";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { ToolCategoryId } from "@app/data/toolsTaxonomy";
import { isValidToolId, type ToolId } from "@app/types/toolId";

export function useSidebarTools() {
  const { preferences, updatePreference } = usePreferences();
  const { allTools } = useToolRegistry();
  const sidebarToolIds = useMemo(() => {
    const stored = preferences.sidebarToolIds;
    if (Array.isArray(stored)) {
      return [...new Set(stored.filter(isValidToolId))];
    }
    return (Object.keys(allTools) as ToolId[]).filter((id) => {
      const tool = allTools[id];
      return (
        tool.categoryId === ToolCategoryId.RECOMMENDED_TOOLS &&
        !tool.hiddenFromToolList &&
        (tool.component !== null ||
          !!tool.link ||
          id === "read" ||
          id === "multiTool")
      );
    });
  }, [allTools, preferences.sidebarToolIds]);

  const toggleSidebarTool = (id: ToolId) => {
    const updated = sidebarToolIds.includes(id)
      ? sidebarToolIds.filter((toolId) => toolId !== id)
      : [...sidebarToolIds, id];
    updatePreference("sidebarToolIds", updated);
  };

  return { sidebarToolIds, toggleSidebarTool };
}
