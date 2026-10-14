import {
  type ToolPanelMode,
  DEFAULT_TOOL_PANEL_MODE,
} from "@app/constants/toolPanel";
import type { ToolId } from "@app/types/toolId";
import { type ThemeMode } from "@app/constants/theme";

export type PdfRenderMode = "normal" | "dark" | "sepia";

export type StartupView = "tools" | "read" | "automate";

export type ViewerZoomSetting =
  | "auto"
  | "fitWidth"
  | "fitPage"
  | "50"
  | "75"
  | "100"
  | "125"
  | "150"
  | "200";

export interface UserPreferences {
  autoUnzip: boolean;
  autoUnzipFileLimit: number;
  defaultToolPanelMode: ToolPanelMode;
  sidebarToolIds: ToolId[] | null;
  defaultStartupView: StartupView;
  defaultViewerZoom: ViewerZoomSetting;
  theme: ThemeMode;
  toolPanelModePromptSeen: boolean;
  hasSelectedToolPanelMode: boolean;
  showLegacyToolDescriptions: boolean;
  hasCompletedOnboarding: boolean;
  hasSeenIntroOnboarding: boolean;
  hasSeenCookieBanner: boolean;
  hideUnavailableTools: boolean;
  hideUnavailableConversions: boolean;
  pdfRenderMode: PdfRenderMode;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoUnzip: true,
  autoUnzipFileLimit: 4,
  defaultToolPanelMode: DEFAULT_TOOL_PANEL_MODE,
  sidebarToolIds: null,
  defaultStartupView: "read",
  defaultViewerZoom: "auto",
  theme: "system",
  toolPanelModePromptSeen: true,
  hasSelectedToolPanelMode: true,
  showLegacyToolDescriptions: false,
  hasCompletedOnboarding: false,
  hasSeenIntroOnboarding: false,
  hasSeenCookieBanner: false,
  hideUnavailableTools: false,
  hideUnavailableConversions: false,
  pdfRenderMode: "normal",
};

const STORAGE_KEY = "stirlingpdf_preferences";

const FIXED_PREFERENCES = {
  defaultToolPanelMode: DEFAULT_PREFERENCES.defaultToolPanelMode,
  toolPanelModePromptSeen: DEFAULT_PREFERENCES.toolPanelModePromptSeen,
  hasSelectedToolPanelMode: DEFAULT_PREFERENCES.hasSelectedToolPanelMode,
  defaultStartupView: DEFAULT_PREFERENCES.defaultStartupView,
  hideUnavailableTools: DEFAULT_PREFERENCES.hideUnavailableTools,
  hideUnavailableConversions: DEFAULT_PREFERENCES.hideUnavailableConversions,
};

class PreferencesService {
  private serverDefaults: Partial<UserPreferences> = {};

  setServerDefaults(defaults: Partial<UserPreferences>): void {
    this.serverDefaults = defaults;
  }

  getPreference<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
    if (key in FIXED_PREFERENCES) return DEFAULT_PREFERENCES[key];
    // Explicitly re-read every time in case preferences have changed in another tab etc.
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const preferences = JSON.parse(stored) as Partial<UserPreferences>;
        if (key in preferences && preferences[key] !== undefined) {
          return preferences[key];
        }
      }
    } catch (error) {
      console.error("Error reading preference:", key, error);
    }
    // Use server defaults if available, otherwise use hardcoded defaults
    if (key in this.serverDefaults && this.serverDefaults[key] !== undefined) {
      return this.serverDefaults[key];
    }
    return DEFAULT_PREFERENCES[key];
  }

  setPreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const preferences = stored ? JSON.parse(stored) : {};
      preferences[key] =
        key in FIXED_PREFERENCES ? DEFAULT_PREFERENCES[key] : value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error("Error writing preference:", key, error);
    }
  }

  getAllPreferences(): UserPreferences {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const preferences = JSON.parse(stored) as Partial<UserPreferences>;
        // Merge with server defaults first, then stored preferences
        return {
          ...DEFAULT_PREFERENCES,
          ...this.serverDefaults,
          ...preferences,
          ...FIXED_PREFERENCES,
        };
      }
    } catch (error) {
      console.error("Error reading preferences", error);
    }
    // Merge server defaults with hardcoded defaults
    return {
      ...DEFAULT_PREFERENCES,
      ...this.serverDefaults,
      ...FIXED_PREFERENCES,
    };
  }

  clearAllPreferences(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing preferences:", error);
      throw error;
    }
  }
}

export const preferencesService = new PreferencesService();
