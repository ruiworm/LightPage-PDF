import { type ReactNode } from "react";
import { AppearanceCard } from "@app/components/shared/config/configSections/preferences/AppearanceCard";
import { EditorDefaultsCard } from "@app/components/shared/config/configSections/preferences/EditorDefaultsCard";
import { DownloadsCard } from "@app/components/shared/config/configSections/preferences/DownloadsCard";
import "@app/components/shared/config/configSections/preferences/PreferencesSection.css";
import { CardLicenseSettings } from "@app/components/license/CardLicensePanel";

export interface PreferencesSectionProps {
  /**
   * The Account and Two-factor cards. Core has no accounts, so the flavors that
   * do pass them in (AccountCards) rather than core reaching into proprietary.
   * The slot supplies its own `<section>` wrappers and anchors.
   */
  accountSlot?: ReactNode;
  /** Extra rows for desktop file defaults. */
  editorDefaultsSlot?: ReactNode;
}

/** Preferences save immediately; every control is available in one panel. */
export default function PreferencesSection({
  accountSlot,
  editorDefaultsSlot,
}: PreferencesSectionProps) {
  return (
    <div className="settings-section-container">
      <div className="preferences-section">
        {accountSlot}

        <div className="preferences-panel">
          <CardLicenseSettings />
          <div id="appearance">
            <AppearanceCard />
          </div>
          <div id="editorDefaults">
            <EditorDefaultsCard />
            {editorDefaultsSlot}
          </div>
          <div id="downloads">
            <DownloadsCard />
          </div>
        </div>
      </div>
    </div>
  );
}
