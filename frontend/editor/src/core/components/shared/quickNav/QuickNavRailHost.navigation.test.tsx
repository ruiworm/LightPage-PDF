import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";
import {
  QuickNavHostProvider,
  useRegisterQuickNavView,
  type QuickNavHostActions,
} from "@app/contexts/QuickNavHostContext";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/shared/quickNav/AppNavigationBar", () => ({
  AppNavigationBar: ({ entries }: { entries: QuickNavEntry[] }) => (
    <nav>
      {entries.map((entry) => (
        <button
          key={entry.id}
          onClick={entry.onClick}
          aria-current={entry.current ? "page" : undefined}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  ),
}));

function Host({ actions }: { actions: QuickNavHostActions }) {
  const { pathname } = useLocation();
  useRegisterQuickNavView(
    {
      fileLibrary: pathname === "/files",
      activeTool: pathname === "/annotate" ? "annotate" : null,
    },
    actions,
  );
  return <output aria-label="Current path">{pathname}</output>;
}

function setup(path: string, actions: QuickNavHostActions) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <QuickNavHostProvider>
        <Host actions={actions} />
        <QuickNavRailHost />
      </QuickNavHostProvider>
    </MemoryRouter>,
  );
}

it.each(["/files", "/annotate"])(
  "returns from %s to the default editor without selecting annotation",
  (path) => {
    const goToDefaultState = vi.fn();
    const selectTool = vi.fn();
    setup(path, { goToDefaultState, selectTool });

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["File library", "Editor", "Tool library"]);
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));

    expect(goToDefaultState).toHaveBeenCalledOnce();
    expect(selectTool).not.toHaveBeenCalled();
  },
);

it.each(["/settings/general", "/tools"])(
  "enters the editor home from %s without selecting annotation",
  (path) => {
    const selectTool = vi.fn();
    setup(path, { selectTool });

    fireEvent.click(screen.getByRole("button", { name: "Editor" }));

    expect(screen.getByLabelText("Current path").textContent).toBe(
      EDITOR_BASENAME,
    );
    expect(selectTool).not.toHaveBeenCalled();
  },
);

it("opens the tool library as a peer page without selecting or resetting a tool", () => {
  const selectTool = vi.fn();
  const goToDefaultState = vi.fn();
  setup("/editor", { selectTool, goToDefaultState });
  fireEvent.click(screen.getByRole("button", { name: "Tool library" }));
  expect(screen.getByLabelText("Current path").textContent).toBe("/tools");
  expect(
    screen
      .getByRole("button", { name: "Tool library" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(
    screen.getByRole("button", { name: "Editor" }).getAttribute("aria-current"),
  ).toBeNull();
  expect(selectTool).not.toHaveBeenCalled();
  expect(goToDefaultState).not.toHaveBeenCalled();
});

it("navigates from the tool library to files rather than calling a stale editor view callback", () => {
  const showFileLibrary = vi.fn();
  setup("/tools", { showFileLibrary });
  fireEvent.click(screen.getByRole("button", { name: "File library" }));
  expect(screen.getByLabelText("Current path").textContent).toBe("/files");
  expect(showFileLibrary).not.toHaveBeenCalled();
});
