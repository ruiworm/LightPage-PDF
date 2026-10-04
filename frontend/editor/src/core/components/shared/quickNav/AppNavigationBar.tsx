import { useTranslation } from "react-i18next";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";
import { QuickNavRailFooterExtensions } from "@app/components/shared/quickNav/QuickNavRailFooterExtensions";
import { Tooltip } from "@app/components/shared/Tooltip";
import { Icon } from "@app/ui/Icon";
import { Logo } from "@app/ui/Logo";
import type { ThemeMode } from "@app/constants/theme";
import "@app/components/shared/quickNav/AppNavigationBar.css";

interface AppNavigationBarProps {
  entries: QuickNavEntry[];
  onReturnHome: () => void;
  onOpenSettings: () => void;
  settingsActive: boolean;
  themeMode: ThemeMode;
  onSetTheme: (mode: ThemeMode) => void;
}

/** Navigation chrome outside the app providers; view changes stay with the host. */
export function AppNavigationBar({
  entries,
  onReturnHome,
  onOpenSettings,
  settingsActive,
  themeMode,
  onSetTheme,
}: AppNavigationBarProps) {
  const { t } = useTranslation();
  const settingsLabel = t("quickAccess.config", "Settings");
  const themeOptions = [
    {
      mode: "light",
      label: t("settings.general.themeLight", "Light"),
      icon: "sun",
    },
    {
      mode: "dark",
      label: t("settings.general.themeDark", "Dark"),
      icon: "moon",
    },
    {
      mode: "system",
      label: t("settings.general.themeSystem", "System"),
      icon: "monitor",
    },
  ] as const;
  const themeIndex = themeOptions.findIndex(
    (option) => option.mode === themeMode,
  );
  const currentTheme = themeOptions[themeIndex] ?? themeOptions[2];
  const nextTheme = themeOptions[(themeIndex + 1) % themeOptions.length];
  const themeLabel = `${t("settings.general.theme", "Theme")}: ${currentTheme.label} → ${nextTheme.label}`;

  return (
    <header className="app-navigation-bar">
      <button
        type="button"
        className="app-navigation-bar__brand"
        aria-label={t("quickNav.home", "Home")}
        onClick={onReturnHome}
      >
        <Logo iconHeight="1.875rem" textHeight="1.375rem" />
      </button>
      <nav
        className="app-navigation-bar__views"
        aria-label={t("quickNav.landmark", "Quick navigation")}
      >
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="app-navigation-bar__view"
            aria-current={entry.current ? "page" : undefined}
            aria-pressed={entry.pressed}
            disabled={entry.disabled}
            title={entry.disabled ? entry.reason : undefined}
            data-testid={entry.testId}
            data-tour={entry.tourId}
            onClick={entry.onClick}
          >
            {entry.icon}
            <span>{entry.label}</span>
          </button>
        ))}
      </nav>
      <div className="app-navigation-bar__actions">
        <QuickNavRailFooterExtensions />
        <Tooltip content={themeLabel} position="bottom" arrow>
          <button
            type="button"
            className="app-navigation-bar__theme"
            aria-label={themeLabel}
            data-testid="theme-toggle-button"
            data-theme-mode={themeMode}
            onClick={() => onSetTheme(nextTheme.mode)}
          >
            <Icon name={currentTheme.icon} size="1.25rem" />
          </button>
        </Tooltip>
        <Tooltip content={settingsLabel} position="bottom" arrow>
          <button
            type="button"
            className="app-navigation-bar__settings"
            aria-label={settingsLabel}
            aria-current={settingsActive ? "page" : undefined}
            onClick={onOpenSettings}
          >
            <Icon name="settings" size="1.25rem" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
