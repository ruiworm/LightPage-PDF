import { describe, it, expect, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FileGrid } from "@app/components/filesPage/FileGrid";
import { FileContextProvider } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FolderId, FolderRecord } from "@app/types/folder";

/**
 * The grid's items are memoized so a selection click re-renders the cards whose
 * selection changed rather than the whole folder. That only holds while every prop
 * they take stays stable - one inline object or closure at a call site silently
 * undoes it, with no visible symptom until a folder is large. These count renders
 * so that regression fails here instead of in someone's 500-file folder.
 */

// @app/ui wraps Mantine, so the provider has to be in the tree.
const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });
// Every card renders this exactly once, so its calls are a per-card render count.
const badgeRenders: { n: number } = { n: 0 };
vi.mock("@app/components/shared/PolicyBadges", () => ({
  PolicyBadges: () => {
    badgeRenders.n += 1;
    return null;
  },
}));
const buildStub = (id: string, name: string): StirlingFileStub => ({
  id: id as FileId,
  name,
  type: "application/pdf",
  size: 1_000,
  lastModified: 0,
  isLeaf: true,
  originalFileId: id,
  versionNumber: 1,
  // Set so useLazyThumbnail short-circuits instead of reading IndexedDB.
  thumbnailUrl: "data:image/svg+xml,%3Csvg/%3E",
});

describe("folder browsing and workspace entry", () => {
  it.each(["grid", "list"] as const)(
    "separates opening a folder from adding it to the workspace in %s view",
    (viewMode) => {
      const onOpenFolder = vi.fn();
      const onAddFolderToWorkspace = vi.fn();
      const folder: FolderRecord = {
        id: "folder" as FolderId,
        kind: "virtual",
        name: "查重报告",
        parentFolderId: null,
        createdAt: 0,
        updatedAt: 0,
      };
      const view = render(
        <FileContextProvider>
          <FileGrid
            entries={[{ kind: "folder", folder, folderFileCount: 2 }]}
            selectedFileIds={new Set()}
            viewMode={viewMode}
            onSelectFile={() => {}}
            onOpenFile={() => {}}
            onOpenFolder={onOpenFolder}
            onAddFolderToWorkspace={onAddFolderToWorkspace}
          />
        </FileContextProvider>,
      );
      fireEvent.click(screen.getByText("查重报告"));
      expect(onOpenFolder).toHaveBeenCalledWith(folder.id);
      expect(onAddFolderToWorkspace).not.toHaveBeenCalled();
      onOpenFolder.mockClear();
      const button = screen.getByRole("button", {
        name: /addToWorkspace|Add to workspace/,
      });
      fireEvent.click(button);
      expect(onAddFolderToWorkspace).toHaveBeenCalledWith(folder.id);
      expect(onOpenFolder).not.toHaveBeenCalled();
      fireEvent.keyDown(button, { key: "Enter" });
      expect(onOpenFolder).not.toHaveBeenCalled();
      expect(
        view.container.querySelector(
          viewMode === "grid"
            ? ".is-folder"
            : ".files-page-list-row:not(.is-header)",
        ),
      ).toBeTruthy();
    },
  );
});

describe("FileGrid item memoization", () => {
  it("re-renders only the cards whose selection changed", () => {
    badgeRenders.n = 0;

    const files = ["a", "b", "c", "d"].map((id) => buildStub(id, `${id}.pdf`));
    const entries = files.map((file) => ({ kind: "file" as const, file }));

    const props = {
      entries,
      viewMode: "grid" as const,
      onSelectFile: () => {},
      onOpenFolder: () => {},
      onOpenFile: () => {},
      onMoveFiles: () => {},
      onMoveFolder: () => {},
      onRenameFolder: () => {},
      onDeleteFolder: () => {},
      onChangeFolderAppearance: () => {},
      onRemoveFiles: () => {},
      onPromptMoveFiles: () => {},
    };

    const view = render(
      <FileContextProvider>
        <FileGrid {...props} selectedFileIds={new Set<FileId>()} />
      </FileContextProvider>,
    );
    const cards = () =>
      view.container.querySelectorAll(".files-page-card:not(.is-folder)");
    expect(cards()).toHaveLength(4);
    const initialRenders = badgeRenders.n;
    expect(initialRenders).toBeGreaterThanOrEqual(4);

    // Selecting one file changes isSelected for exactly one card. The rest take
    // identical props, so memo should skip them.
    view.rerender(
      <FileContextProvider>
        <FileGrid
          {...props}
          selectedFileIds={new Set<FileId>(["a" as FileId])}
        />
      </FileContextProvider>,
    );
    expect(cards()).toHaveLength(4);
    expect(
      view.container.querySelectorAll(".files-page-card.is-selected"),
    ).toHaveLength(1);

    // The point of the exercise: one card changed, so the re-render count moves by
    // one card's worth and not four. Unmemoized items redraw the whole folder here.
    const rerendered = badgeRenders.n - initialRenders;
    const perCard = initialRenders / 4;
    expect(rerendered).toBe(perCard);
    // The real provider tree and four thumbnail-bearing cards cost seconds to mount,
    // which the default budget cannot absorb alongside the rest of the suite.
  }, 20_000);
});

describe("FileGrid processing locks", () => {
  it.each(["grid", "list"] as const)(
    "disables opening a locked disk file in %s view",
    async (viewMode) => {
      const onOpenDiskFile = vi.fn();
      const entry = {
        kind: "diskFile" as const,
        disk: {
          path: "/processing/report.pdf",
          name: "report.pdf",
          sizeBytes: 1_000,
          lastModified: 0,
        },
        diskState: "waiting" as const,
        processingLocked: true,
      };

      const view = render(
        <FileContextProvider>
          <FileGrid
            entries={[entry]}
            selectedFileIds={new Set<FileId>()}
            viewMode={viewMode}
            onSelectFile={() => {}}
            onOpenFolder={() => {}}
            onOpenFile={() => {}}
            onOpenDiskFile={onOpenDiskFile}
            onMoveFiles={() => {}}
            onMoveFolder={() => {}}
            onRenameFolder={() => {}}
            onDeleteFolder={() => {}}
            onChangeFolderAppearance={() => {}}
            onRemoveFiles={() => {}}
            onPromptMoveFiles={() => {}}
          />
        </FileContextProvider>,
      );

      const fileItem = view.container.querySelector(
        viewMode === "grid"
          ? ".files-page-card"
          : ".files-page-list-row:not(.is-header)",
      );
      expect(fileItem).not.toBeNull();
      fireEvent.doubleClick(fileItem!);

      fireEvent.click(
        within(fileItem as HTMLElement).getByRole("button", {
          name: /fileMenu|File actions/,
        }),
      );
      const addToWorkspace = await screen.findByRole("menuitem", {
        name: /addToWorkspace|Add to workspace/,
      });
      expect(addToWorkspace).toBeDisabled();
      fireEvent.click(addToWorkspace);

      expect(onOpenDiskFile).not.toHaveBeenCalled();
    },
  );
});
