import { Text, Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button, type ButtonVariant, type ButtonAccent } from "@app/ui/Button";
import OperationButton, {
  OperationButtonProps,
  operationButtonVariantMap,
  operationButtonAccentMap,
} from "@app/components/tools/shared/OperationButton";
import { StirlingFile } from "@app/types/fileContext";
import { useAllFiles } from "@app/contexts/FileContext";
import { useNavigationState } from "@app/contexts/NavigationContext";

export interface ScopedOperationButtonProps extends OperationButtonProps {
  selectedFiles: StirlingFile[];
  disableScopeHints?: boolean;
  usesWorkspaceSelection?: boolean;
}

/**
 * Wraps OperationButton with scope-aware button text and a filename note.
 *
 * - A single viewer-scoped input: appends "(this file)" to button text and
 *   shows a note naming the exact file that will be processed.
 * - Multiple processing inputs: appends "(N files)" to button text.
 * - All other cases: no change to button text or layout.
 */
export function ScopedOperationButton({
  selectedFiles,
  disableScopeHints,
  usesWorkspaceSelection = false,
  ...props
}: ScopedOperationButtonProps) {
  const { t } = useTranslation();
  const { workbench } = useNavigationState();
  const { files: allFiles, fileIds } = useAllFiles();

  // Disable until all files are hydrated — running early would silently skip unloaded files.
  const isFilesHydrating = fileIds.length > allFiles.length;
  const effectiveDisabledReason =
    isFilesHydrating && props.disabledReason !== "endpointUnavailable"
      ? "filesLoading"
      : props.disabledReason;

  const isViewerMode = workbench === "viewer";
  const baseText = props.submitText ?? t("submit", "Submit");

  const disabledForViewerMode = props.disabledReason === "viewerMode";

  let scopedText = baseText;
  if (!disableScopeHints && !disabledForViewerMode) {
    if (isViewerMode && !usesWorkspaceSelection && selectedFiles.length === 1) {
      scopedText = `${baseText} (${t("tool.scopeThisFile", "this file")})`;
    } else if (selectedFiles.length > 1) {
      scopedText = `${baseText} (${t("workspaceFiles.fileCount", "{{count}} files", { count: selectedFiles.length })})`;
    }
  }

  const viewerFileName =
    !disableScopeHints &&
    !disabledForViewerMode &&
    isViewerMode &&
    !usesWorkspaceSelection &&
    selectedFiles.length === 1
      ? selectedFiles[0]?.name
      : null;

  const pendingCount = fileIds.length - allFiles.length;
  const isBulkLoading = pendingCount > 1;
  const loadProgress = isBulkLoading
    ? (allFiles.length / fileIds.length) * 100
    : 0;
  const showSelectFilesHint =
    !disableScopeHints && allFiles.length > 0 && selectedFiles.length === 0;

  const loadingVariant: ButtonVariant =
    operationButtonVariantMap[props.variant ?? "filled"] ?? "primary";
  const loadingAccent: ButtonAccent =
    operationButtonAccentMap[props.color ?? "blue"] ?? "default";

  return (
    <>
      {isFilesHydrating ? (
        <Box mx="md" mt="md" className="tool-operation-placeholder">
          <Button
            fullWidth
            disabled
            loading={!isBulkLoading}
            variant={loadingVariant}
            accent={loadingAccent}
            style={{
              position: "relative",
              overflow: "hidden",
              minHeight: "2.5rem",
              pointerEvents: "none",
            }}
          >
            {isBulkLoading && (
              <>
                <Box
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "var(--c-text-on-primary)",
                    opacity: 0.15,
                    transform: `scaleX(${loadProgress / 100})`,
                    transformOrigin: "left",
                    transition: "transform 0.3s ease",
                    borderRadius: "inherit",
                  }}
                />
                <Text size="sm" style={{ position: "relative" }}>
                  {t(
                    "tool.filesLoadingProgress",
                    "{{loaded}} / {{total}} files loading...",
                    {
                      loaded: allFiles.length,
                      total: fileIds.length,
                    },
                  )}
                </Text>
              </>
            )}
          </Button>
        </Box>
      ) : (
        <OperationButton
          {...props}
          submitText={scopedText}
          disabledReason={effectiveDisabledReason}
        />
      )}
      {viewerFileName && (
        <Text
          size="xs"
          c="dimmed"
          ta="center"
          mx="md"
          mt={2}
          className="tool-scope-note"
        >
          {t("tool.singleFileScope", "Only applying to: {{fileName}}", {
            fileName: viewerFileName,
          })}
        </Text>
      )}
      {showSelectFilesHint && (
        <Text
          size="xs"
          c="dimmed"
          ta="center"
          mx="md"
          mt={2}
          className="tool-scope-note"
        >
          {isViewerMode && !usesWorkspaceSelection
            ? t(
                "workspaceFiles.openFileHint",
                "Click a filename on the left to open the file you want to process.",
              )
            : t(
                "tool.selectFilesHint",
                "Select files using the checkboxes on the left",
              )}
        </Text>
      )}
    </>
  );
}
