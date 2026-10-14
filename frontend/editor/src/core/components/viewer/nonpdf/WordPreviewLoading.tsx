import { useEffect, useState } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

/** Quick cached loads finish before a progress indicator would flash on screen. */
export function WordPreviewLoading() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Center
      style={{ flex: 1, minHeight: 0 }}
      role="status"
      aria-label={t("viewer.nonPdf.loading")}
    >
      {visible && (
        <Stack align="center" gap="sm">
          <Loader size="sm" />
          <Text c="dimmed" size="sm">
            {t("viewer.nonPdf.loading")}
          </Text>
        </Stack>
      )}
    </Center>
  );
}
