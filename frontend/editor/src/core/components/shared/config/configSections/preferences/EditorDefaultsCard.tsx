import { useId } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Select, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { type ViewerZoomSetting } from "@app/services/preferencesService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

export function EditorDefaultsCard() {
  const { t } = useTranslation();
  // Each setting is a row of label text next to a bare control, so the controls
  // are named by pointing at that text rather than by a <label> association.
  const labelIds = useId();
  const viewerZoomLabelId = `${labelIds}-viewer-zoom`;
  const { preferences, updatePreference } = usePreferences();

  return (
    <div id="setting-reader-zoom" className="preference-row">
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
            updatePreference("defaultViewerZoom", val as ViewerZoomSetting);
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
  );
}
