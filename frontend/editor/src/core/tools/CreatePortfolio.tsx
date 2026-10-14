import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import CreatePortfolioSettings from "@app/components/tools/createPortfolio/CreatePortfolioSettings";
import { useCreatePortfolioParameters } from "@app/hooks/tools/createPortfolio/useCreatePortfolioParameters";
import { useCreatePortfolioOperation } from "@app/hooks/tools/createPortfolio/useCreatePortfolioOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useCreatePortfolioTips } from "@app/components/tooltips/useCreatePortfolioTips";

const CreatePortfolio = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const tips = useCreatePortfolioTips();

  const base = useBaseTool(
    "createPortfolio",
    useCreatePortfolioParameters,
    useCreatePortfolioOperation,
    props,
    { minFiles: 2, ignoreViewerScope: true },
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      minFiles: 2,
    },
    steps: [
      {
        title: t("createPortfolio.settings", "Portfolio Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: tips,
        content: (
          <CreatePortfolioSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("createPortfolio.submit", "Create Portfolio"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("createPortfolio.title", "Portfolio Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default CreatePortfolio as ToolComponent;
