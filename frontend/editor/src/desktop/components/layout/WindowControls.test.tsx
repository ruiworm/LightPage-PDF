import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppNavigationBar } from "@app/components/shared/quickNav/AppNavigationBar";
import { TitleBarChrome } from "@app/components/layout/TitleBarChrome";
import { useTitleBarStrip } from "@app/contexts/TitleBarStripContext";

const state = vi.hoisted(() => ({
  native: true,
  os: "windows",
  host: { appMounted: true, chromeless: false },
  maximized: false,
  resized: undefined as (() => void) | undefined,
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  startDragging: vi.fn(async () => {}),
  release: vi.fn(),
  onResized: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => state.native }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: state.minimize,
    toggleMaximize: state.toggleMaximize,
    close: state.close,
    startDragging: state.startDragging,
    isMaximized: async () => state.maximized,
    onResized: state.onResized,
  }),
}));
vi.mock("@app/hooks/useDesktopOs", () => ({
  useDesktopOs: () => state.os,
}));
vi.mock("@app/contexts/QuickNavHostContext", () => ({
  useQuickNavHost: () => state.host,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/ui/Logo", () => ({ Logo: () => <span>LightPage PDF</span> }));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/shared/quickNav/QuickNavRailFooterExtensions", () => ({
  QuickNavRailFooterExtensions: () => null,
}));

function Content() {
  const strip = useTitleBarStrip();
  return (
    <div className="app-frame">
      {state.host.appMounted && !state.host.chromeless && (
        <AppNavigationBar
          entries={[]}
          onReturnHome={vi.fn()}
          onOpenSettings={vi.fn()}
          settingsActive={false}
          themeMode="system"
          onSetTheme={vi.fn()}
        />
      )}
      <output aria-label="Workbench placement">
        {strip.enabled ? "caption" : "document"}
      </output>
    </div>
  );
}

function setup() {
  return render(
    <TitleBarChrome>
      <Content />
    </TitleBarChrome>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.native = true;
  state.os = "windows";
  state.host = { appMounted: true, chromeless: false };
  state.maximized = false;
  state.resized = undefined;
  state.onResized.mockImplementation(async (callback: () => void) => {
    state.resized = callback;
    return state.release;
  });
});

it("places caption controls after settings and keeps the workbench in the document area", async () => {
  setup();
  const minimize = await screen.findByRole("button", { name: "Minimize" });
  const settings = screen.getByRole("button", { name: "Settings" });
  expect(minimize.closest(".app-navigation-bar")).toBe(
    settings.closest("header"),
  );
  expect(
    settings.compareDocumentPosition(minimize) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expect(screen.getByLabelText("Workbench placement")).toHaveTextContent(
    "document",
  );
  expect(document.querySelector("[data-title-bar-strip]")).toBeNull();

  fireEvent.click(minimize);
  fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(state.minimize).toHaveBeenCalledOnce();
  expect(state.toggleMaximize).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();

  state.maximized = true;
  await act(async () => state.resized?.());
  expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
});

it("keeps window controls reachable before activation when app navigation is absent", async () => {
  state.host.appMounted = false;
  setup();
  await screen.findByRole("button", { name: "Close" });
  expect(document.querySelector(".app-navigation-bar")).toBeNull();
  expect(document.querySelector("[data-title-bar-strip]")).not.toBeNull();
});

it("does not expose inert window controls or call native APIs in browser previews", () => {
  state.native = false;
  setup();
  expect(screen.queryByRole("button", { name: "Minimize" })).toBeNull();
  fireEvent.mouseDown(document.querySelector("header")!, {
    clientX: 10,
    clientY: 10,
  });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10 });
  expect(state.startDragging).not.toHaveBeenCalled();
  expect(state.onResized).not.toHaveBeenCalled();
});

it("drags blank app-header space without consuming navigation or settings clicks", async () => {
  setup();
  await screen.findByRole("button", { name: "Maximize" });
  const header = document.querySelector("header")!;
  fireEvent.mouseDown(header, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10 });
  fireEvent.mouseUp(document);
  expect(state.startDragging).toHaveBeenCalledOnce();

  const settings = screen.getByRole("button", { name: "Settings" });
  fireEvent.mouseDown(settings, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10 });
  fireEvent.mouseUp(document);
  expect(state.startDragging).toHaveBeenCalledOnce();
  expect(state.toggleMaximize).not.toHaveBeenCalled();
});

it("releases resize subscriptions that arrive after the caption unmounts", async () => {
  let finish: ((release: () => void) => void) | undefined;
  state.onResized.mockReturnValue(
    new Promise<() => void>((resolve) => {
      finish = resolve;
    }),
  );
  const view = setup();
  await waitFor(() => expect(state.onResized).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => finish?.(state.release));
  expect(state.release).toHaveBeenCalledOnce();
});
