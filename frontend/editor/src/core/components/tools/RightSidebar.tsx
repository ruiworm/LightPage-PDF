import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useViewActive } from "@app/components/layout/RetainedView";
import ToolPanel from "@app/components/tools/ToolPanel";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import { EditorPipelinesPanel } from "@app/components/policies/EditorPipelinesPanel";
import { ToolIcon } from "@app/components/shared/ToolIcon";
import { ToolPanelHeader } from "@app/components/shared/ToolPanelHeader";
import { withViewTransition } from "@app/utils/viewTransition";
import type { ToolId } from "@app/types/toolId";
import "@app/components/tools/ToolPanel.css";

export default function RightSidebar() {
  const viewActive = useViewActive();
  const { workbench } = useNavigationState();
  const { t } = useTranslation();
  const { sidebarRefs } = useSidebarContext();
  const isMobile = useIsMobile();
  const policiesEnabled = usePoliciesEnabled();
  const {
    leftPanelView,
    toolRegistry,
    selectedToolKey,
    handleToolSelect,
    handleBackToTools,
  } = useToolWorkflow();
  const activeTool =
    leftPanelView !== "toolPicker" &&
    selectedToolKey &&
    !(
      selectedToolKey === "pdfTextEditor" &&
      workbench !== "custom:pdfTextEditor"
    )
      ? toolRegistry[selectedToolKey]
      : null;

  return (
    <div
      ref={sidebarRefs.toolPanelRef}
      data-sidebar="tool-panel"
      data-tour="tool-panel"
      className={`tool-panel flex flex-col overflow-hidden ${isMobile ? "h-full border-l border-[var(--c-border-subtle)]" : "tool-panel--floating"}`}
      style={{ width: isMobile ? "100%" : "18.5rem", padding: 0 }}
    >
      {viewActive && (
        <div
          style={{
            height: "100%",
            width: "100%",
            maxWidth: isMobile ? "44rem" : undefined,
            marginInline: isMobile ? "auto" : undefined,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            minHeight: 0,
          }}
        >
          {policiesEnabled && <EditorPipelinesPanel />}
          {activeTool && (
            <ToolPanelHeader
              icon={
                <ToolIcon
                  icon={activeTool.icon}
                  marginRight="0"
                  color="currentColor"
                />
              }
              title={activeTool.name}
              onClose={() => withViewTransition(handleBackToTools)}
              closeLabel={t(
                "toolLibrary.backToSidebar",
                "Back to sidebar tools",
              )}
            />
          )}
          <ToolPanel
            onToolSelect={(id: ToolId) =>
              withViewTransition(() => handleToolSelect(id))
            }
            showSearch={isMobile}
          />
        </div>
      )}
    </div>
  );
}
