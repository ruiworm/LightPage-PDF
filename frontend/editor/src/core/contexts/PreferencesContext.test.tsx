import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PreferencesProvider,
  usePreferences,
} from "@app/contexts/PreferencesContext";
import { preferencesService } from "@app/services/preferencesService";

const STORAGE_KEY = "stirlingpdf_preferences";

function renderPreferences() {
  return renderHook(() => usePreferences(), { wrapper: PreferencesProvider });
}

beforeEach(() => {
  localStorage.clear();
  preferencesService.setServerDefaults({});
});

afterEach(() => {
  localStorage.clear();
  preferencesService.setServerDefaults({});
});

describe("fixed editor preferences", () => {
  it("opens the reader and hides unavailable options on first launch", () => {
    const { result } = renderPreferences();

    expect(result.current.preferences).toMatchObject({
      defaultStartupView: "read",
      defaultViewerZoom: "auto",
      hideUnavailableTools: true,
      hideUnavailableConversions: true,
    });
  });

  it("ignores retired stored settings while preserving zoom and theme", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        defaultStartupView: "automate",
        hideUnavailableTools: true,
        hideUnavailableConversions: true,
        defaultToolPanelMode: "fullscreen",
        defaultViewerZoom: "125",
        theme: "dark",
      }),
    );
    const { result } = renderPreferences();

    expect(result.current.preferences).toMatchObject({
      defaultStartupView: "read",
      hideUnavailableTools: true,
      hideUnavailableConversions: true,
      defaultToolPanelMode: "sidebar",
      defaultViewerZoom: "125",
      theme: "dark",
    });
    expect(preferencesService.getPreference("defaultStartupView")).toBe("read");
    expect(preferencesService.getPreference("hideUnavailableTools")).toBe(true);
    expect(preferencesService.getPreference("hideUnavailableConversions")).toBe(
      true,
    );
  });

  it("keeps the fixed behavior when server defaults arrive", () => {
    const { result } = renderPreferences();

    act(() =>
      result.current.updateServerDefaults({
        defaultStartupView: "tools",
        hideUnavailableTools: true,
        hideUnavailableConversions: true,
        defaultViewerZoom: "fitWidth",
      }),
    );

    expect(result.current.preferences).toMatchObject({
      defaultStartupView: "read",
      hideUnavailableTools: true,
      hideUnavailableConversions: true,
      defaultViewerZoom: "fitWidth",
    });
  });

  it("cannot re-enable retired settings through a preference update", () => {
    const { result } = renderPreferences();

    act(() => {
      result.current.updatePreference("defaultStartupView", "automate");
      result.current.updatePreference("hideUnavailableTools", true);
      result.current.updatePreference("hideUnavailableConversions", true);
    });

    expect(result.current.preferences).toMatchObject({
      defaultStartupView: "read",
      hideUnavailableTools: true,
      hideUnavailableConversions: true,
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      defaultStartupView: "read",
      hideUnavailableTools: true,
      hideUnavailableConversions: true,
    });
  });

  it("persists an editable zoom across provider mounts", () => {
    const first = renderPreferences();
    act(() =>
      first.result.current.updatePreference("defaultViewerZoom", "150"),
    );
    expect(first.result.current.preferences.defaultViewerZoom).toBe("150");
    first.unmount();

    const second = renderPreferences();
    expect(second.result.current.preferences.defaultViewerZoom).toBe("150");
  });

  it("restores automatic zoom and the fixed behavior when preferences reset", () => {
    const { result } = renderPreferences();
    act(() => result.current.updatePreference("defaultViewerZoom", "200"));
    act(() => result.current.resetPreferences());

    expect(result.current.preferences).toMatchObject({
      defaultStartupView: "read",
      defaultViewerZoom: "auto",
      hideUnavailableTools: true,
      hideUnavailableConversions: true,
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
