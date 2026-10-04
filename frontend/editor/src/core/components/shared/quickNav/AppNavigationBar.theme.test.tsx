import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import {
  QuickNavHostProvider,
  useRegisterQuickNavView,
} from "@app/contexts/QuickNavHostContext";
import {
  PreferencesProvider,
  usePreferences,
} from "@app/contexts/PreferencesContext";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import { preferencesService } from "@app/services/preferencesService";

vi.mock("@app/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/ui/Logo", () => ({ Logo: () => null }));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/shared/quickNav/QuickNavRailFooterExtensions", () => ({
  QuickNavRailFooterExtensions: () => null,
}));

function EditorTheme() {
  const { preferences, updatePreference } = usePreferences();
  useRegisterQuickNavView(
    { themeMode: preferences.theme },
    { setTheme: (mode) => updatePreference("theme", mode) },
  );
  return null;
}

function setup() {
  return render(
    <MemoryRouter>
      <QuickNavHostProvider>
        <QuickNavRailHost />
        <PreferencesProvider>
          <ThemeProvider>
            <EditorTheme />
          </ThemeProvider>
        </PreferencesProvider>
      </QuickNavHostProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

it("cycles system, light, dark, and system from the app bar outside the theme provider", () => {
  setup();
  const toggle = screen.getByTestId("theme-toggle-button");
  expect(toggle).toHaveAttribute("data-theme-mode", "system");

  for (const mode of ["light", "dark", "system"] as const) {
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("data-theme-mode", mode);
    expect(preferencesService.getPreference("theme")).toBe(mode);
    if (mode !== "system") {
      expect(document.documentElement).toHaveAttribute("data-theme", mode);
    }
  }
});

it("restores the selected mode when the app is mounted again", () => {
  const view = setup();
  fireEvent.click(screen.getByTestId("theme-toggle-button"));
  fireEvent.click(screen.getByTestId("theme-toggle-button"));
  view.unmount();

  setup();

  expect(screen.getByTestId("theme-toggle-button")).toHaveAttribute(
    "data-theme-mode",
    "dark",
  );
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
});
