import { useMemo, useRef } from "react";
import { FileId } from "@app/types/file";

/**
 * Maintains stable color assignments for a collection of file IDs.
 * Colors are assigned by insertion order and preserved across reorders.
 */
export function useFileColorMap(fileIds: FileId[]): Map<FileId, number> {
  const assignmentsRef = useRef(new Map<FileId, number>());

  return useMemo(() => {
    const assignments = new Map(assignmentsRef.current);
    const activeIds = new Set(fileIds);

    // Remove colors for files that no longer exist
    for (const id of Array.from(assignments.keys())) {
      if (!activeIds.has(id)) {
        assignments.delete(id);
      }
    }

    const usedColors = new Set(assignments.values());
    fileIds.forEach((id) => {
      if (!assignments.has(id)) {
        let colorIndex = 0;
        while (usedColors.has(colorIndex)) colorIndex += 1;
        assignments.set(id, colorIndex);
        usedColors.add(colorIndex);
      }
    });

    assignmentsRef.current = assignments;
    return assignments;
  }, [fileIds]);
}
