import { useState, type ComponentProps } from "react";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceFolderList } from "@app/components/shared/WorkspaceFolderList";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import type { FolderId, FolderRecord } from "@app/types/folder";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));

const folders: FolderRecord[] = ["Contracts", "Resumes"].map((name) => ({
  id: name as FolderId,
  name,
  parentFolderId: null,
  createdAt: 0,
  updatedAt: 0,
}));
const files = [createNewStirlingFileStub(new File(["pdf"], "example.pdf"))];
const onFolder = vi.fn();
const onRemoveFolder = vi.fn();
const props: ComponentProps<typeof WorkspaceFolderList> = {
  folders,
  selected: folders[0].id,
  files,
  recent: [],
  loading: false,
  selectedCount: 1,
  renderFile: (file) => <span key={file.id}>{file.name}</span>,
  onFolder,
  onRemoveFolder,
  onRecent: vi.fn(),
  onAddFiles: vi.fn(),
  onManage: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

it("opens folder actions with right-click and removes only the requested shortcut", async () => {
  const user = userEvent.setup();
  render(<List />);
  expect(
    fireEvent.contextMenu(screen.getByRole("button", { name: "Resumes" })),
  ).toBe(false);
  await user.click(await screen.findByRole("menuitem"));
  expect(onRemoveFolder).toHaveBeenCalledExactlyOnceWith(folders[1]);
  expect(onFolder).not.toHaveBeenCalled();
});

it("offers the same remove action through the visible folder menu", async () => {
  const user = userEvent.setup();
  render(<List />);
  await user.click(
    screen.getAllByRole("button", { name: "Folder actions for {{name}}" })[0],
  );
  await user.click(await screen.findByRole("menuitem"));
  expect(onRemoveFolder).toHaveBeenCalledExactlyOnceWith(folders[0]);
  expect(onFolder).not.toHaveBeenCalled();
});

function List({ selected = folders[0].id }: { selected?: FolderId | "" }) {
  return (
    <MantineProvider env="test">
      <WorkspaceFolderList {...props} selected={selected} />
    </MantineProvider>
  );
}

it("collapses and reopens the active folder without changing the active scope", async () => {
  const user = userEvent.setup();
  render(<List />);
  const folder = screen.getByRole("button", { name: "Contracts" });
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("example.pdf")).toBeInTheDocument();

  await user.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("example.pdf")).not.toBeInTheDocument();

  await user.keyboard("{Enter}");
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("example.pdf")).toBeInTheDocument();
  expect(onFolder).not.toHaveBeenCalled();
});

it("expands a newly chosen folder after collapsing the previous one", async () => {
  const user = userEvent.setup();
  function Harness() {
    const [selected, setSelected] = useState<FolderId | "">(folders[0].id);
    return (
      <MantineProvider env="test">
        <WorkspaceFolderList
          {...props}
          selected={selected}
          onFolder={(id) => {
            onFolder(id);
            setSelected(id);
          }}
        />
      </MantineProvider>
    );
  }
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Contracts" }));
  await user.click(screen.getByRole("button", { name: "Resumes" }));
  expect(onFolder).toHaveBeenCalledExactlyOnceWith(folders[1].id);
  expect(screen.getByRole("button", { name: "Contracts" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.getByRole("button", { name: "Resumes" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByText("example.pdf")).toBeInTheDocument();
});

it("opens folders selected externally, including returning to a collapsed folder", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<List />);
  await user.click(screen.getByRole("button", { name: "Contracts" }));
  rerender(<List selected={folders[1].id} />);
  expect(screen.getByRole("button", { name: "Resumes" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  rerender(<List />);
  expect(screen.getByRole("button", { name: "Contracts" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByText("example.pdf")).toBeInTheDocument();
  expect(onFolder).not.toHaveBeenCalled();
});

it("also toggles the opened-files list without clearing its selection", async () => {
  const user = userEvent.setup();
  render(<List selected="" />);
  const folder = screen.getByRole("button", { name: "Opened files" });
  await user.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("example.pdf")).not.toBeInTheDocument();
  await user.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("example.pdf")).toBeInTheDocument();
  expect(onFolder).not.toHaveBeenCalled();
});
