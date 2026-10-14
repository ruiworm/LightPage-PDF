import { useEffect, useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "@app/components/layout/AppRoot";
import { useViewActive } from "@app/components/layout/RetainedView";

const lifecycle = vi.hoisted(() => ({ opens: 0, closes: 0, commands: 0 }));
vi.mock("@app/components/startup/StartupPrompts", () => ({
  StartupPrompts: () => null,
}));
vi.mock("@app/pages/HomePage", () => ({
  default: function DocumentSession() {
    const active = useViewActive();
    const [page, setPage] = useState(1);
    useEffect(() => {
      lifecycle.opens++;
      return () => {
        lifecycle.closes++;
      };
    }, []);
    useEffect(() => {
      if (!active) return;
      const command = () => {
        lifecycle.commands++;
      };
      document.addEventListener("keydown", command);
      return () => document.removeEventListener("keydown", command);
    }, [active]);
    return <button onClick={() => setPage(4)}>PDF page {page}</button>;
  },
}));
vi.mock("@app/pages/ToolLibraryPage", () => ({
  default: () => <div>Tool library</div>,
}));
vi.mock("@app/pages/SettingsPage", () => ({
  default: () => <div>Settings</div>,
}));

let navigate: ReturnType<typeof useNavigate>;
function Navigation() {
  navigate = useNavigate();
  return null;
}
function renderApp(path = "/editor") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigation />
      <AppRoot />
    </MemoryRouter>,
  );
}

describe("retained editor document", () => {
  beforeEach(() => {
    lifecycle.opens = 0;
    lifecycle.closes = 0;
    lifecycle.commands = 0;
  });

  it("keeps the document and page across tools, settings and browser history", async () => {
    const app = renderApp();
    fireEvent.click(screen.getByRole("button", { name: "PDF page 1" }));
    for (const path of ["/tools", "/settings/general"]) {
      act(() => navigate(path));
      await screen.findByText(path === "/tools" ? "Tool library" : "Settings");
      expect(screen.queryByRole("button", { name: "PDF page 4" })).toBeNull();
      expect(document.querySelector("[inert]")).not.toBeNull();
      fireEvent.keyDown(document, { key: "Delete" });
      expect(lifecycle.commands).toBe(0);
      act(() => navigate(-1));
      await screen.findByRole("button", { name: "PDF page 4" });
    }
    expect(lifecycle.opens).toBe(1);
    expect(lifecycle.closes).toBe(0);
    fireEvent.keyDown(document, { key: "PageDown" });
    expect(lifecycle.commands).toBe(1);
    app.unmount();
    expect(lifecycle.closes).toBe(1);
  });

  it("does not start a PDF session when the app opens directly in the library", async () => {
    renderApp("/tools");
    await screen.findByText("Tool library");
    expect(lifecycle.opens).toBe(0);
    act(() => navigate("/editor"));
    await screen.findByRole("button", { name: "PDF page 1" });
    await waitFor(() => expect(lifecycle.opens).toBe(1));
  });
});
