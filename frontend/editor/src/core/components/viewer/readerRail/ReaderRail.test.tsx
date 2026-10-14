import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, it, vi } from "vitest";
import ReaderRail from "@app/components/viewer/readerRail/ReaderRail";

const session = { activeFileId: null as string | null };
const pages = vi.fn();
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/contexts/WorkbenchBarContext", () => ({
  useWorkbenchBar: () => ({
    buttons: [{ id: "viewer-toggle-sidebar" }],
    actions: { "viewer-toggle-sidebar": pages },
  }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ ...session, setActiveFileId: vi.fn() }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationGuard: () => ({ requestNavigation: (go: () => void) => go() }),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useAllFiles: () => ({
    files: [],
    fileIds: session.activeFileId ? [session.activeFileId] : [],
  }),
  useFileManagement: () => ({ removeFiles: vi.fn() }),
}));
vi.mock("@app/contexts/FilesModalContext", () => ({
  useFilesModalContext: () => ({ openFilesModal: vi.fn() }),
}));

it("hides the document rail on the empty reader and restores working actions on open", () => {
  session.activeFileId = null;
  const view = render(
    <MantineProvider>
      <ReaderRail />
    </MantineProvider>,
  );
  expect(
    screen.queryByRole("navigation", { name: "Reading tools" }),
  ).not.toBeInTheDocument();
  session.activeFileId = "PDF";
  view.rerender(
    <MantineProvider>
      <ReaderRail />
    </MantineProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pages" }));
  expect(pages).toHaveBeenCalledTimes(1);
});
