import type { FC } from "react";
import PreferencesSection from "@core/components/shared/config/configSections/preferences/PreferencesSection";
import { DefaultAppSettings } from "@app/components/shared/config/configSections/DefaultAppSettings";

interface GeneralSectionProps {
  hideTitle?: boolean;
}

const GeneralSection: FC<GeneralSectionProps> = () => (
  <PreferencesSection editorDefaultsSlot={<DefaultAppSettings />} />
);

export default GeneralSection;
