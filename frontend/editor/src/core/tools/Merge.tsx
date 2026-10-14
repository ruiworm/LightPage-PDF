import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import MergeSettings from "@app/components/tools/merge/MergeSettings";
import MergeFileSorter from "@app/components/tools/merge/MergeFileSorter";
import { useMergeParameters } from "@app/hooks/tools/merge/useMergeParameters";
import { useMergeOperation } from "@app/hooks/tools/merge/useMergeOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useMergeTips } from "@app/components/tooltips/useMergeTips";
import {
  useFileManagement,
  useAllFiles,
  useFileSelection,
} from "@app/contexts/FileContext";
import MergeFileOrder from "@app/components/tools/merge/MergeFileOrder";

const Merge = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const mergeTips = useMergeTips();

  // File selection hooks for custom sorting
  const { fileIds, fileStubs } = useAllFiles();
  const { reorderFiles } = useFileManagement();
  const { selectedFileIds, setSelectedFiles } = useFileSelection();

  const base = useBaseTool(
    "merge",
    useMergeParameters,
    useMergeOperation,
    props,
    { minFiles: 2, ignoreViewerScope: true },
  );

  const naturalCompare = useCallback((a: string, b: string): number => {
    const isDigit = (char: string) => char >= "0" && char <= "9";

    const getChunk = (
      s: string,
      length: number,
      marker: number,
    ): { chunk: string; newMarker: number } => {
      let chunk = "";
      const c = s.charAt(marker);
      chunk += c;
      marker++;

      if (isDigit(c)) {
        while (marker < length && isDigit(s.charAt(marker))) {
          chunk += s.charAt(marker);
          marker++;
        }
      } else {
        while (marker < length && !isDigit(s.charAt(marker))) {
          chunk += s.charAt(marker);
          marker++;
        }
      }
      return { chunk, newMarker: marker };
    };

    const len1 = a.length;
    const len2 = b.length;
    let marker1 = 0;
    let marker2 = 0;

    while (marker1 < len1 && marker2 < len2) {
      const { chunk: chunk1, newMarker: newMarker1 } = getChunk(
        a,
        len1,
        marker1,
      );
      marker1 = newMarker1;

      const { chunk: chunk2, newMarker: newMarker2 } = getChunk(
        b,
        len2,
        marker2,
      );
      marker2 = newMarker2;

      let result: number;
      if (isDigit(chunk1.charAt(0)) && isDigit(chunk2.charAt(0))) {
        const num1 = parseInt(chunk1, 10);
        const num2 = parseInt(chunk2, 10);
        result = num1 - num2;
      } else {
        result = chunk1.localeCompare(chunk2);
      }

      if (result !== 0) {
        return result;
      }
    }

    return len1 - len2;
  }, []);

  // Custom file sorting logic for merge tool
  const sortFiles = useCallback(
    (sortType: "filename" | "dateModified", ascending: boolean = true) => {
      const sortedStubs = fileStubs
        .filter((stub) => selectedFileIds.includes(stub.id))
        .sort((stubA, stubB) => {
          let comparison = 0;
          switch (sortType) {
            case "filename":
              comparison = naturalCompare(stubA.name, stubB.name);
              break;
            case "dateModified":
              comparison = stubA.lastModified - stubB.lastModified;
              break;
          }
          return ascending ? comparison : -comparison;
        });

      const selectedIds = sortedStubs.map((record) => record.id);
      const deselectedIds = fileIds.filter((id) => !selectedIds.includes(id));
      reorderFiles([...selectedIds, ...deselectedIds]);
      setSelectedFiles(selectedIds);
    },
    [
      fileStubs,
      fileIds,
      selectedFileIds,
      setSelectedFiles,
      reorderFiles,
      naturalCompare,
    ],
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      minFiles: 2,
    },
    steps: [
      {
        title: t("merge.sortFiles.title", "Sort Files"),
        isCollapsed: base.settingsCollapsed,
        content: (
          <>
            <MergeFileOrder
              files={base.selectedFiles}
              onReorder={(ids) => {
                reorderFiles([
                  ...ids,
                  ...fileIds.filter((id) => !ids.includes(id)),
                ]);
                setSelectedFiles(ids);
              }}
              disabled={base.operation.isLoading || base.endpointLoading}
            />
            <MergeFileSorter
              onSortFiles={sortFiles}
              disabled={
                !base.hasFiles ||
                base.endpointLoading ||
                base.operation.isLoading
              }
            />
          </>
        ),
      },
      {
        title: t("merge.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: mergeTips,
        content: (
          <MergeSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("merge.submit", "Merge PDFs"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("merge.title", "Merge Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Merge as ToolComponent;
