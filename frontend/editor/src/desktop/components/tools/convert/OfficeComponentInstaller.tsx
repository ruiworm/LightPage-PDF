import { useEffect, useState } from "react";
import { Badge, Group, Paper, Progress, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { connectionModeService } from "@app/services/connectionModeService";
import { desktopUpdateService } from "@app/services/desktopUpdateService";
import {
  installOfficeComponent,
  refreshOfficeComponent,
  useOfficeComponent,
} from "@app/services/officeComponentService";

/** Local Windows conversion setup; remote servers own their conversion dependencies. */
export function OfficeComponentInstaller({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { status, busy, progress, error } = useOfficeComponent();
  const [local, setLocal] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const setMode = (mode: string) => {
      if (!active) return;
      setLocal(mode === "local");
      if (mode === "local") void refreshOfficeComponent();
    };
    void connectionModeService.getCurrentMode().then(setMode, () => undefined);
    const unsubscribe = connectionModeService.subscribeToModeChanges((config) =>
      setMode(config.mode),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!local || status?.supported === false || (!status && !error)) return null;
  if (compact && status?.installed && !status.restartRequired) return null;

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0;
  const phase = progress?.phase ?? "download";
  const phaseLabel = {
    download: t("officeComponent.downloading", "Downloading component"),
    verify: t("officeComponent.verifying", "Verifying download"),
    extract: t("officeComponent.extracting", "Installing component"),
  }[phase];

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      aria-label={t("officeComponent.title", "Document conversion component")}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {t("officeComponent.title", "Document conversion component")}
          </Text>
          {status?.installed && (
            <Badge>{t("officeComponent.installed", "Installed")}</Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {t(
            "officeComponent.description",
            "Install LibreOffice when you need Word, Excel or PowerPoint conversion. PDF editing, images and OCR work without this component.",
          )}
        </Text>
        {!status?.installed && status && (
          <Text size="xs" c="dimmed">
            {t(
              "officeComponent.size",
              "Download: {{download}} MB · Installed: {{installed}} MB",
              {
                download: Math.ceil(status.downloadBytes / 1000000),
                installed: Math.ceil(status.installedBytes / 1000000),
              },
            )}
          </Text>
        )}
        {busy && (
          <Stack gap={4} role="status" aria-live="polite">
            <Text size="xs">
              {phaseLabel}
              {progress?.total ? ` ${percent}%` : "…"}
            </Text>
            <Progress
              value={percent}
              animated={phase === "verify" || !progress}
              aria-label={phaseLabel}
            />
          </Stack>
        )}
        {(error || restartError) && (
          <Text size="xs" role="alert">
            {error || restartError}
          </Text>
        )}
        {status?.restartRequired ? (
          <>
            <Text size="xs">
              {t(
                "officeComponent.restartHint",
                "Save your documents, then restart the app to enable document conversion.",
              )}
            </Text>
            <Button
              size="sm"
              onClick={() => {
                setRestartError(null);
                void desktopUpdateService
                  .restartApp()
                  .catch((reason: unknown) => setRestartError(String(reason)));
              }}
            >
              {t("officeComponent.restart", "Restart app")}
            </Button>
          </>
        ) : (
          !status?.installed && (
            <Button
              size="sm"
              loading={busy}
              onClick={() =>
                void (status
                  ? installOfficeComponent()
                  : refreshOfficeComponent())
              }
            >
              {error
                ? t("officeComponent.retry", "Retry")
                : t("officeComponent.install", "Install conversion component")}
            </Button>
          )
        )}
      </Stack>
    </Paper>
  );
}
