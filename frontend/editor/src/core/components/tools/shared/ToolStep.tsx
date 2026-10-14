import React, { createContext, useContext, useMemo, useId } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Text, Stack, Flex, Divider } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { TooltipTip } from "@app/types/tips";
import {
  createFilesToolStep,
  FilesToolStepProps,
} from "@app/components/tools/shared/FilesToolStep";
import {
  createReviewToolStep,
  ReviewToolStepProps,
} from "@app/components/tools/shared/ReviewToolStep";

interface ToolStepContextType {
  visibleStepCount: number;
  forceStepNumbers?: boolean;
  presentation?: "steps" | "groups";
  expandGroups?: boolean;
}

const ToolStepContext = createContext<ToolStepContextType | null>(null);

export interface ToolStepProps {
  title: string;
  isVisible?: boolean;
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
  children?: React.ReactNode;
  helpText?: string;
  showNumber?: boolean;
  _stepNumber?: number; // Internal prop set by ToolStepContainer
  _excludeFromCount?: boolean; // Internal prop to exclude from visible count calculation
  _noPadding?: boolean; // Internal prop to exclude from default left padding
  alwaysShowTooltip?: boolean; // Force tooltip to show even when collapsed
  tooltip?: {
    content?: React.ReactNode;
    tips?: TooltipTip[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

const renderTooltipTitle = (
  title: string,
  tooltip: ToolStepProps["tooltip"],
  isCollapsed: boolean,
  alwaysShowTooltip: boolean = false,
) => {
  if (tooltip && (!isCollapsed || alwaysShowTooltip)) {
    return (
      <Tooltip
        content={tooltip.content}
        tips={tooltip.tips}
        header={tooltip.header}
        sidebarTooltip={true}
        pinOnClick={true}
      >
        <Flex align="center" gap="xs" onClick={(e) => e.stopPropagation()}>
          <Text fw={400} size="sm">
            {title}
          </Text>
          <Icon
            name="info"
            size="1.25rem"
            style={{ color: "var(--icon-files-color)" }}
          />
        </Flex>
      </Tooltip>
    );
  }

  return (
    <Text fw={500} size="sm">
      {title}
    </Text>
  );
};

const ToolStep = ({
  title,
  isVisible = true,
  isCollapsed = false,
  onCollapsedClick,
  children,
  helpText,
  showNumber,
  _stepNumber,
  _noPadding,
  alwaysShowTooltip = false,
  tooltip,
}: ToolStepProps) => {
  const parent = useContext(ToolStepContext);
  const { t } = useTranslation();
  const headingId = useId();

  // Auto-detect if we should show numbers based on sibling count or force option
  const shouldShowNumber = useMemo(() => {
    if (showNumber !== undefined) return showNumber; // Individual step override
    if (parent?.forceStepNumbers) return true; // Flow-level force
    return parent ? parent.visibleStepCount >= 3 : false; // Auto-detect
  }, [showNumber, parent]);

  if (!isVisible) return null;

  const stepNumber = _stepNumber;

  if (parent?.presentation === "groups") {
    const collapsed = isCollapsed && !parent.expandGroups;
    return (
      <section className="tool-settings-group" aria-labelledby={headingId}>
        <div className="tool-settings-group__header">
          <h3 id={headingId}>
            {collapsed && onCollapsedClick ? (
              <button
                type="button"
                className="tool-settings-group__edit"
                onClick={onCollapsedClick}
              >
                {title}
                <Icon name="pencil" size={14} />
              </button>
            ) : (
              title
            )}
          </h3>
          {tooltip && (!collapsed || alwaysShowTooltip) && (
            <Tooltip
              content={tooltip.content}
              tips={tooltip.tips}
              header={tooltip.header}
              sidebarTooltip
              pinOnClick
            >
              <ActionIcon
                variant="quiet"
                accent="neutral"
                size="sm"
                aria-label={`${t("help", "Help")}: ${title}`}
              >
                <Icon name="info" size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
        {!collapsed && (
          <div className="tool-settings-group__body">
            {helpText && (
              <p className="tool-settings-group__help">{helpText}</p>
            )}
            {children}
          </div>
        )}
      </section>
    );
  }

  return (
    <div>
      <div
        style={{
          padding: "0.5rem",
          color: isCollapsed ? "var(--mantine-color-dimmed)" : "inherit",
          transition: "color 0.2s ease",
        }}
      >
        {/* Chevron icon to collapse/expand the step */}
        <Flex
          align="center"
          justify="space-between"
          mb="sm"
          style={{
            cursor: onCollapsedClick ? "pointer" : "default",
          }}
          onClick={onCollapsedClick}
        >
          <Flex align="center" gap="sm">
            {shouldShowNumber && (
              <Text fw={500} size="sm" c="dimmed" mr="0.5rem">
                {stepNumber}
              </Text>
            )}
            {renderTooltipTitle(title, tooltip, isCollapsed, alwaysShowTooltip)}
          </Flex>

          {isCollapsed ? (
            <Icon
              name="chevron-right"
              size="1.2rem"
              style={{
                color: "var(--mantine-color-dimmed)",
                opacity: onCollapsedClick ? 1 : 0.5,
              }}
            />
          ) : (
            <Icon
              name="chevron-down"
              size="1.2rem"
              style={{
                color: "var(--mantine-color-dimmed)",
                opacity: onCollapsedClick ? 1 : 0.5,
              }}
            />
          )}
        </Flex>

        {!isCollapsed && (
          <Stack gap="sm" pl={_noPadding ? 0 : "sm"}>
            {helpText && (
              <Text size="sm" c="dimmed">
                {helpText}
              </Text>
            )}
            {children}
          </Stack>
        )}
      </div>
      <Divider
        style={{
          color: "var(--c-border)",
          marginLeft: "1rem",
          marginRight: "-0.5rem",
        }}
      />
    </div>
  );
};

// ToolStepFactory for creating numbered steps
export function createToolSteps() {
  let stepNumber = 1;
  const steps: React.ReactElement[] = [];

  const create = (
    title: string,
    props: Omit<ToolStepProps, "title" | "_stepNumber"> = {},
    children?: React.ReactNode,
  ): React.ReactElement => {
    const isVisible = props.isVisible !== false;
    const currentStepNumber = isVisible ? stepNumber++ : undefined;

    const step = React.createElement(
      ToolStep,
      {
        ...props,
        title,
        _stepNumber: currentStepNumber,
        key: `step-${title.toLowerCase().replace(/\s+/g, "-")}`,
      },
      children,
    );

    steps.push(step);
    return step;
  };

  const createFilesStep = (props: FilesToolStepProps): React.ReactElement => {
    return createFilesToolStep(create, props);
  };

  const createReviewStep = <TParams = unknown,>(
    props: ReviewToolStepProps<TParams>,
  ): React.ReactElement => {
    return createReviewToolStep(create, props);
  };

  const getVisibleCount = () => {
    return steps.filter((step) => {
      const stepProps = step.props as ToolStepProps;
      const isVisible = stepProps.isVisible !== false;
      const excludeFromCount = stepProps._excludeFromCount === true;
      return isVisible && !excludeFromCount;
    }).length;
  };

  return { create, createFilesStep, createReviewStep, getVisibleCount, steps };
}

// Context provider wrapper for tools using the factory
export function ToolStepProvider({
  children,
  forceStepNumbers,
  presentation,
  expandGroups,
}: {
  children: React.ReactNode;
  forceStepNumbers?: boolean;
  presentation?: "steps" | "groups";
  expandGroups?: boolean;
}) {
  const parent = useContext(ToolStepContext);
  // Count visible steps from children that are ToolStep elements
  const visibleStepCount = useMemo(() => {
    let count = 0;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === ToolStep) {
        const stepProps = child.props as ToolStepProps;
        const isVisible = stepProps.isVisible !== false;
        const excludeFromCount = stepProps._excludeFromCount === true;
        if (isVisible && !excludeFromCount) count++;
      }
    });
    return count;
  }, [children]);

  const contextValue = useMemo(
    () => ({
      visibleStepCount,
      forceStepNumbers,
      presentation: presentation ?? parent?.presentation,
      expandGroups: expandGroups ?? parent?.expandGroups,
    }),
    [
      visibleStepCount,
      forceStepNumbers,
      presentation,
      expandGroups,
      parent?.presentation,
      parent?.expandGroups,
    ],
  );

  return (
    <ToolStepContext.Provider value={contextValue}>
      {children}
    </ToolStepContext.Provider>
  );
}

export type { FilesToolStepProps } from "@app/components/tools/shared/FilesToolStep";
export type { ReviewToolStepProps } from "@app/components/tools/shared/ReviewToolStep";
export default ToolStep;
