import type { ReactNode } from "react";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import "@app/components/shared/ToolPanelHeader.css";

export interface ToolPanelHeaderProps {
  /** Glyph identifying the active tool. */
  icon: ReactNode;
  /** Header title. */
  title: ReactNode;
  /** Close (X) handler. The trailing close button renders only when supplied. */
  onClose?: () => void;
  /** aria-label for the close button. */
  closeLabel?: string;
}

export function ToolPanelHeader({
  icon,
  title,
  onClose,
  closeLabel,
}: ToolPanelHeaderProps) {
  return (
    <div className="tool-panel-header">
      <div className="tool-panel-header__bar">
        <span className="tool-panel-header__icon">{icon}</span>
        <span className="tool-panel-header__label">{title}</span>
      </div>
      {onClose && (
        <ActionIcon
          className="tool-panel-header__close"
          variant="tertiary"
          accent="neutral"
          shape="circle"
          size="md"
          onClick={onClose}
          aria-label={closeLabel ?? ""}
        >
          <Icon name="x" size={18} />
        </ActionIcon>
      )}
    </div>
  );
}
