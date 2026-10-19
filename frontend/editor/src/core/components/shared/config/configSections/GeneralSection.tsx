import React, { useId } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Paper, Stack, Text, Select } from "@mantine/core";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useTheme } from "@app/components/shared/ThemeProvider";
import LanguageSelector from "@app/components/shared/LanguageSelector";
import { type ViewerZoomSetting } from "@app/services/preferencesService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

interface GeneralSectionProps {
  hideTitle?: boolean;
}

const GeneralSection: React.FC<GeneralSectionProps> = ({
  hideTitle = false,
}) => {
  const { t } = useTranslation();
  // Each setting is a row of label text next to a bare control, so the controls
  // are named by pointing at that text rather than by a <label> association.
  const labelIds = useId();
  const viewerZoomLabelId = `${labelIds}-viewer-zoom`;
  const { preferences, updatePreference } = usePreferences();
  const { setTheme, themeMode } = useTheme();

  return (
    <Stack gap="lg">
      {!hideTitle && (
        <div>
          <Text fw={600} size="lg">
            {t("settings.general.title", "General")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "settings.general.description",
              "Configure general application preferences.",
            )}
          </Text>
        </div>
      )}

      {/* Appearance */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div
            id="setting-theme"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} size="sm">
                {t("settings.general.theme", "Theme")}{" "}
                <InfoTooltip
                  label={t(
                    "settings.general.themeDescription",
                    "Choose light, dark, or follow your system so it switches automatically.",
                  )}
                />
              </Text>
            </div>
            <SegmentedControl
              value={themeMode}
              onChange={(val) => setTheme(val)}
              options={[
                {
                  label: t("settings.general.themeLight", "Light"),
                  value: "light",
                },
                {
                  label: t("settings.general.themeDark", "Dark"),
                  value: "dark",
                },
                {
                  label: t("settings.general.themeSystem", "System"),
                  value: "system",
                },
              ]}
            />
          </div>
        </Stack>
      </Paper>

      {/* Language */}
      <Paper withBorder p="md" radius="md">
        <div
          id="setting-language"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t("settings.general.language", "Language")}{" "}
              <InfoTooltip
                label={t(
                  "settings.general.languageDescription",
                  "Choose the display language",
                )}
              />
            </Text>
          </div>
          <LanguageSelector position="bottom-end" offset={6} />
        </div>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div
            id="setting-reader-zoom"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text id={viewerZoomLabelId} fw={500} size="sm">
                {t("settings.general.defaultViewerZoom", "Default reader zoom")}{" "}
                <InfoTooltip
                  label={t(
                    "settings.general.defaultViewerZoomDescription",
                    "Set the default zoom level when opening PDFs in the reader",
                  )}
                />
              </Text>
            </div>
            <Select
              aria-labelledby={viewerZoomLabelId}
              value={preferences.defaultViewerZoom}
              onChange={(val: string | null) => {
                if (val)
                  updatePreference(
                    "defaultViewerZoom",
                    val as ViewerZoomSetting,
                  );
              }}
              data={[
                {
                  label: t("settings.general.zoomLevel.auto", "Auto"),
                  value: "auto",
                },
                {
                  label: t("settings.general.zoomLevel.fitWidth", "Fit width"),
                  value: "fitWidth",
                },
                {
                  label: t("settings.general.zoomLevel.fitPage", "Fit page"),
                  value: "fitPage",
                },
                { label: "50%", value: "50" },
                { label: "75%", value: "75" },
                { label: "100%", value: "100" },
                { label: "125%", value: "125" },
                { label: "150%", value: "150" },
                { label: "200%", value: "200" },
              ]}
              style={{ width: 140 }}
              allowDeselect={false}
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
            />
          </div>
        </Stack>
      </Paper>
    </Stack>
  );
};

export default GeneralSection;
