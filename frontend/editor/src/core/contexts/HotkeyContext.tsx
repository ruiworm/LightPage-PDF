import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  HotkeyBinding,
  bindingEquals,
  bindingMatchesEvent,
  deserializeBindings,
  getDisplayParts,
  isMacLike,
  normalizeBinding,
  serializeBindings,
} from "@app/utils/hotkeys";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ToolId } from "@app/types/toolId";
import {
  isComingSoonTool,
  ToolCategoryId,
  ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { filterToolRegistryByQuery } from "@app/utils/toolSearch";

type Bindings = Partial<Record<ToolId, HotkeyBinding>>;

interface HotkeyContextValue {
  tools: [ToolId, ToolRegistryEntry][];
  hotkeys: Bindings;
  defaults: Bindings;
  isMac: boolean;
  updateHotkey: (toolId: ToolId, binding: HotkeyBinding) => void;
  resetHotkey: (toolId: ToolId) => void;
  isBindingAvailable: (
    binding: HotkeyBinding,
    excludeToolId?: ToolId,
  ) => boolean;
  pauseHotkeys: () => void;
  resumeHotkeys: () => void;
  areHotkeysPaused: boolean;
  getDisplayParts: (binding: HotkeyBinding | null | undefined) => string[];
}

const HotkeyContext = createContext<HotkeyContextValue | undefined>(undefined);

const STORAGE_KEY = "stirlingpdf.hotkeys";

const generateDefaultHotkeys = (
  toolEntries: [ToolId, ToolRegistryEntry][],
  macLike: boolean,
): Bindings => {
  const defaults: Bindings = {};

  // Get Quick Access tools (RECOMMENDED_TOOLS category) from registry
  const quickAccessTools = toolEntries
    .filter(([_, tool]) => tool.categoryId === ToolCategoryId.RECOMMENDED_TOOLS)
    .map(([toolId, _]) => toolId);

  // Assign Cmd+Option+Number (Mac) or Ctrl+Alt+Number (Windows) to Quick Access tools
  quickAccessTools.forEach((toolId, index) => {
    if (index < 9) {
      // Limit to Digit1-9
      const digitNumber = index + 1;
      defaults[toolId] = {
        code: `Digit${digitNumber}`,
        alt: true,
        shift: false,
        meta: macLike,
        ctrl: !macLike,
      };
    }
  });

  // All other tools have no default (will be undefined in the record)
  return defaults;
};

const shouldIgnoreTarget = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const editable = target.closest(
    'input, textarea, [contenteditable="true"], [role="textbox"]',
  );
  return Boolean(editable);
};

export const HotkeyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { toolRegistry, handleToolSelect } = useToolWorkflow();
  const isMac = useMemo(() => isMacLike(), []);
  const [customBindings, setCustomBindings] = useState<Bindings>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    return deserializeBindings(window.localStorage?.getItem(STORAGE_KEY));
  });
  const [areHotkeysPaused, setHotkeysPaused] = useState(false);

  const toolEntries = useMemo(
    () =>
      filterToolRegistryByQuery(toolRegistry, "")
        .map(({ item }) => item)
        .filter(([toolId, tool]) => !isComingSoonTool(toolId, tool)),
    [toolRegistry],
  );
  const shortcutToolIds = useMemo(
    () => new Set(toolEntries.map(([toolId]) => toolId)),
    [toolEntries],
  );

  const defaults = useMemo(
    () => generateDefaultHotkeys(toolEntries, isMac),
    [toolEntries, isMac],
  );

  useEffect(() => {
    setCustomBindings((prev) => {
      const next: Bindings = {};
      let changed = false;
      (Object.entries(prev) as [ToolId, HotkeyBinding][]).forEach(
        ([toolId, binding]) => {
          if (shortcutToolIds.has(toolId)) {
            next[toolId] = binding;
          } else {
            changed = true;
          }
        },
      );
      return changed ? next : prev;
    });
  }, [shortcutToolIds]);

  const resolved = useMemo(() => {
    const merged: Bindings = {};
    toolEntries.forEach(([toolId, _]) => {
      const custom = customBindings[toolId];
      const defaultBinding = defaults[toolId];

      // Only add to resolved if there's a custom binding or a default binding
      if (custom) {
        merged[toolId] = normalizeBinding(custom);
      } else if (defaultBinding) {
        merged[toolId] = defaultBinding;
      }
      // If neither exists, don't add to merged (tool has no hotkey)
    });
    return merged;
  }, [customBindings, defaults, toolEntries]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, serializeBindings(customBindings));
  }, [customBindings]);

  const isBindingAvailable = useCallback(
    (binding: HotkeyBinding, excludeToolId?: ToolId) => {
      const normalized = normalizeBinding(binding);
      return Object.entries(resolved).every(([toolId, existing]) => {
        if (toolId === excludeToolId) {
          return true;
        }
        return !bindingEquals(existing, normalized);
      });
    },
    [resolved],
  );

  const updateHotkey = useCallback(
    (toolId: ToolId, binding: HotkeyBinding) => {
      if (!shortcutToolIds.has(toolId)) return;
      setCustomBindings((prev) => {
        const normalized = normalizeBinding(binding);
        const defaultsForTool = defaults[toolId];
        const next = { ...prev };
        if (defaultsForTool && bindingEquals(defaultsForTool, normalized)) {
          delete next[toolId];
        } else {
          next[toolId] = normalized;
        }
        return next;
      });
    },
    [defaults, shortcutToolIds],
  );

  const resetHotkey = useCallback((toolId: ToolId) => {
    setCustomBindings((prev) => {
      if (!(toolId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[toolId];
      return next;
    });
  }, []);

  const pauseHotkeys = useCallback(() => setHotkeysPaused(true), []);
  const resumeHotkeys = useCallback(() => setHotkeysPaused(false), []);

  useEffect(() => {
    if (areHotkeysPaused) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (shouldIgnoreTarget(event.target)) return;

      const entries = Object.entries(resolved) as [ToolId, HotkeyBinding][];
      for (const [toolId, binding] of entries) {
        if (bindingMatchesEvent(binding, event)) {
          event.preventDefault();
          event.stopPropagation();
          handleToolSelect(toolId);
          break;
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [resolved, areHotkeysPaused, handleToolSelect]);

  const contextValue = useMemo<HotkeyContextValue>(
    () => ({
      tools: toolEntries,
      hotkeys: resolved,
      defaults,
      isMac,
      updateHotkey,
      resetHotkey,
      isBindingAvailable,
      pauseHotkeys,
      resumeHotkeys,
      areHotkeysPaused,
      getDisplayParts: (binding) => getDisplayParts(binding ?? null, isMac),
    }),
    [
      toolEntries,
      resolved,
      defaults,
      isMac,
      updateHotkey,
      resetHotkey,
      isBindingAvailable,
      pauseHotkeys,
      resumeHotkeys,
      areHotkeysPaused,
    ],
  );

  return (
    <HotkeyContext.Provider value={contextValue}>
      {children}
    </HotkeyContext.Provider>
  );
};

export const useHotkeys = (): HotkeyContextValue => {
  const context = useContext(HotkeyContext);
  if (!context) {
    throw new Error("useHotkeys must be used within a HotkeyProvider");
  }
  return context;
};
