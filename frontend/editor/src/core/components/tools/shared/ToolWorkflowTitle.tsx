import React from "react";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { TooltipTip } from "@app/types/tips";

export interface ToolWorkflowTitleProps {
  title: string;
  description?: string;
  tooltip?: {
    content?: React.ReactNode;
    tips?: TooltipTip[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

export function ToolWorkflowTitle({
  title,
  tooltip,
  description,
}: ToolWorkflowTitleProps) {
  return (
    <div className="tool-workflow-intro">
      <div className="tool-settings-group__header">
        <h3>{title}</h3>
        {tooltip && (
          <Tooltip
            content={tooltip.content}
            tips={tooltip.tips}
            header={tooltip.header}
            sidebarTooltip={true}
          >
            <ActionIcon
              variant="quiet"
              accent="neutral"
              size="sm"
              aria-label={title}
            >
              <Icon name="info" size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      {description && (
        <p className="tool-settings-group__help">{description}</p>
      )}
    </div>
  );
}
