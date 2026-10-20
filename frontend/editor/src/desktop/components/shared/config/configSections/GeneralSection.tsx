import type { FC } from "react";
import { Stack } from "@mantine/core";
import PreferencesSection from "@core/components/shared/config/configSections/preferences/PreferencesSection";
import { DefaultAppSettings } from "@app/components/shared/config/configSections/DefaultAppSettings";
import { OfficeComponentInstaller } from "@app/components/tools/convert/OfficeComponentInstaller";

interface GeneralSectionProps {
  hideTitle?: boolean;
}

const GeneralSection: FC<GeneralSectionProps> = () => (
  <PreferencesSection
    editorDefaultsSlot={
      <Stack gap="md">
        <DefaultAppSettings />
        <OfficeComponentInstaller />
      </Stack>
    }
  />
);

export default GeneralSection;
