import { useTranslation } from "react-i18next";
import { NavSurface } from "@app/ui/NavSurface";
import { Icon } from "@app/ui/Icon";
import { QuickNavBrand } from "@app/components/shared/quickNav/QuickNavBrand";
import {
  QuickNavRailBase,
  RailButton,
  type QuickNavRailBaseProps,
} from "@app/components/shared/quickNav/QuickNavRailBase";
import { QuickNavRailFooterExtensions } from "@app/components/shared/quickNav/QuickNavRailFooterExtensions";
import "@app/components/shared/quickNav/QuickNavRailContainer.css";

export type {
  QuickNavEntry,
  QuickNavTarget,
} from "@app/components/shared/quickNav/QuickNavRailBase";

export interface QuickNavRailContainerProps extends Omit<
  QuickNavRailBaseProps,
  "footer"
> {
  onOpenSettings?: () => void;
  settingsActive?: boolean;
  /** Omitted in builds with no docs to browse. */
  onOpenDocs?: () => void;
  docsActive?: boolean;
  /** Omitted in builds with no processor to invite anyone into. */
  onInvite?: () => void;
  onReturnHome: () => void;
}

/** The fixed-width column the rail sits in. */
export function QuickNavRailContainer({
  onOpenSettings,
  settingsActive = false,
  onOpenDocs,
  docsActive = false,
  onInvite,
  onReturnHome,
  ...railProps
}: QuickNavRailContainerProps) {
  const { t } = useTranslation();
  return (
    <div className="quick-nav-rail-container">
      <QuickNavBrand onReturnHome={onReturnHome} />
      <NavSurface className="quick-nav-rail-surface">
        <QuickNavRailBase
          {...railProps}
          footer={
            <div className="quick-nav-rail-footer">
              <QuickNavRailFooterExtensions />
              {onInvite && (
                <RailButton
                  label={t("quickNav.invite", "Invite")}
                  icon={<Icon name="user-plus" size="1.125rem" />}
                  onClick={onInvite}
                />
              )}
              {onOpenDocs && (
                <RailButton
                  label={t("quickNav.docs", "Documentation")}
                  // No `filled`: the mark is a ring around a stroked glyph, so a
                  // fill swallows the question mark and leaves a blank disc.
                  icon={<Icon name="circle-question-mark" size="1.125rem" />}
                  current={docsActive}
                  testId="docs-button"
                  onClick={onOpenDocs}
                />
              )}
              {onOpenSettings && (
                <RailButton
                  label={t("settings.title", "Settings")}
                  icon={<Icon name="settings" size="1.125rem" />}
                  current={settingsActive}
                  testId="config-button"
                  onClick={onOpenSettings}
                />
              )}
            </div>
          }
        />
      </NavSurface>
    </div>
  );
}
