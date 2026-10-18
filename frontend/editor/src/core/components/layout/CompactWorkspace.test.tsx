import { useEffect, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import {
  CompactWorkspace,
  CompactWorkspaceButton,
} from "@app/components/layout/CompactWorkspace";

const mounted = vi.fn();
const panelMounted = vi.fn();
function Panel({ label }: { label: string }) {
  useEffect(() => {
    panelMounted(label);
  }, [label]);
  return <p>{label}</p>;
}
function Document() {
  const [value, setValue] = useState("未保存的中文内容");
  useEffect(() => {
    mounted();
  }, []);
  return (
    <>
      <CompactWorkspaceButton panel="files" />
      <CompactWorkspaceButton panel="tools" />
      <textarea
        aria-label="document"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </>
  );
}

function workspace(
  compact: boolean,
  activeFileId = "document",
  toolKey: string | null = null,
  toolHasSettings = false,
  active = true,
) {
  return (
    <MantineProvider env="test">
      <CompactWorkspace
        compact={compact}
        active={active}
        files={<Panel label="文件夹列表" />}
        tools={<Panel label="工具设置" />}
        filesVisible
        toolsVisible
        activeFileId={activeFileId}
        toolKey={toolKey}
        toolHasSettings={toolHasSettings}
      >
        <Document />
      </CompactWorkspace>
    </MantineProvider>
  );
}

describe("compact document workspace", () => {
  it("releases the panel when the workspace is hidden behind another page", async () => {
    const view = render(workspace(true, "document", "redact", true));
    expect(await screen.findByRole("dialog")).toHaveTextContent("工具设置");
    view.rerender(workspace(true, "document", "redact", true, false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "document" })).toHaveValue(
      "未保存的中文内容",
    );
  });
  it("preserves unsaved content through resizing and opening either side panel", async () => {
    mounted.mockClear();
    panelMounted.mockClear();
    const view = render(workspace(false));
    fireEvent.change(screen.getByRole("textbox", { name: "document" }), {
      target: { value: "编辑中的地址" },
    });
    view.rerender(workspace(true));
    fireEvent.click(
      screen.getByRole("button", { name: /workspaceFolders.mine|My folders/ }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent("文件夹列表");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /home.mobile.tools|Tools/ }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent("工具设置");
    view.rerender(workspace(false));
    expect(screen.getByRole("textbox", { name: "document" })).toHaveValue(
      "编辑中的地址",
    );
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(panelMounted).toHaveBeenCalledTimes(2);
  });

  it("reveals the document after selecting a file and opens settings for a newly selected tool", async () => {
    const view = render(workspace(true));
    fireEvent.click(
      screen.getByRole("button", { name: /workspaceFolders.mine|My folders/ }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent("文件夹列表");
    view.rerender(workspace(true, "second"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    view.rerender(workspace(true, "second", "redact", true));
    expect(await screen.findByRole("dialog")).toHaveTextContent("工具设置");
  });
});
