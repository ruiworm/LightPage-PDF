import React, { useId, useState, useEffect } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Paper, Stack, Switch, Text, NumberInput, Select } from "@mantine/core";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useTheme } from "@app/components/shared/ThemeProvider";
import LanguageSelector from "@app/components/shared/LanguageSelector";
import { type ViewerZoomSetting } from "@app/services/preferencesService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
const DEFAULT_AUTO_UNZIP_FILE_LIMIT = 4;

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
  const autoUnzipLabelId = `${labelIds}-auto-unzip`;
  const autoUnzipLimitLabelId = `${labelIds}-auto-unzip-limit`;
  const { preferences, updatePreference } = usePreferences();
  const { setTheme, themeMode } = useTheme();
  const [fileLimitInput, setFileLimitInput] = useState<number | string>(
    preferences.autoUnzipFileLimit,
  );
  // Sync local state with preference changes
  useEffect(() => {
    setFileLimitInput(preferences.autoUnzipFileLimit);
  }, [preferences.autoUnzipFileLimit]);

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
          <div
            id="setting-auto-unzip"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text id={autoUnzipLabelId} fw={500} size="sm">
                {t("settings.general.autoUnzip", "Auto-unzip API responses")}{" "}
                <InfoTooltip
                  label={t(
                    "settings.general.autoUnzipTooltip",
                    "Automatically extract ZIP files returned from API operations. Disable to keep ZIP files intact. This does not affect automation workflows.",
                  )}
                />
              </Text>
            </div>
            <Switch
              aria-labelledby={autoUnzipLabelId}
              checked={preferences.autoUnzip}
              onChange={(event) =>
                updatePreference("autoUnzip", event.currentTarget.checked)
              }
            />
          </div>

          <div
            id="setting-auto-unzip-file-limit"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text id={autoUnzipLimitLabelId} fw={500} size="sm">
                {t(
                  "settings.general.autoUnzipFileLimit",
                  "Auto-unzip file limit",
                )}{" "}
                <InfoTooltip
                  label={t(
                    "settings.general.autoUnzipFileLimitTooltip",
                    "Only unzip if the ZIP contains this many files or fewer. Set higher to extract larger ZIPs.",
                  )}
                />
              </Text>
            </div>
            <NumberInput
              aria-labelledby={autoUnzipLimitLabelId}
              value={fileLimitInput}
              onChange={setFileLimitInput}
              onBlur={() => {
                const numValue = Number(fileLimitInput);
                const finalValue =
                  !fileLimitInput ||
                  isNaN(numValue) ||
                  numValue < 1 ||
                  numValue > 100
                    ? DEFAULT_AUTO_UNZIP_FILE_LIMIT
                    : numValue;
                setFileLimitInput(finalValue);
                updatePreference("autoUnzipFileLimit", finalValue);
              }}
              min={1}
              max={100}
              step={1}
              disabled={!preferences.autoUnzip}
              style={{ width: 90 }}
            />
          </div>
        </Stack>
      </Paper>
    </Stack>
  );
};

export default GeneralSection;
