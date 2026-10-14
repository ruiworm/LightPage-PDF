import { Center, Stack, Loader, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

export default function ToolLoadingFallback({
  toolName,
}: {
  toolName?: string;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <Center h="100%" w="100%">
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text c="dimmed" size="sm">
          {toolName
            ? t("toolLoading.named", "Loading {{toolName}}...", { toolName })
            : t("toolLoading.generic", "Loading tool...")}
        </Text>
      </Stack>
    </Center>
  );
}
