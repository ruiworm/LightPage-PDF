import { cleanup, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesSection from "@app/components/shared/config/configSections/preferences/PreferencesSection";
import HotkeyDisplay from "@app/components/hotkeys/HotkeyDisplay";

const { updatePreference } = vi.hoisted(() => ({ updatePreference: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: {
      autoUnzip: true,
      autoUnzipFileLimit: 4,
      defaultViewerZoom: "auto",
    },
    updatePreference,
  }),
}));
vi.mock("@app/components/license/CardLicensePanel", () => ({
  CardLicenseSettings: () => null,
}));
vi.mock("@app/components/shared/LanguageSelector", () => ({
  default: () => <span>Display language</span>,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("preferences without tool shortcuts", () => {
  it("keeps reader preferences without retired shortcut or download controls", () => {
    render(
      <MantineProvider>
        <PreferencesSection />
      </MantineProvider>,
    );

    expect(screen.getByText("Display language")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Default reader zoom" }),
    ).toBeVisible();
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search tools..."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "Auto-unzip API responses" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Auto-unzip file limit" }),
    ).not.toBeInTheDocument();
  });

  it("can still describe standard editor keys without a shortcut provider", () => {
    render(<HotkeyDisplay binding={{ code: "KeyZ", ctrl: true }} />);
    expect(screen.getByText("Ctrl")).toBeVisible();
    expect(screen.getByText("Z")).toBeVisible();
  });
});
