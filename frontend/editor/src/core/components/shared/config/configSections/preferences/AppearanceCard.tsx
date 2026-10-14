import { Text } from "@mantine/core";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { useTranslation } from "react-i18next";
import LanguageSelector from "@app/components/shared/LanguageSelector";

export function AppearanceCard() {
  const { t } = useTranslation();

  return (
    <div id="setting-language" className="preference-row">
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
  );
}
