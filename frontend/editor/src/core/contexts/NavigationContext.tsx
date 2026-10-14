import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { WorkbenchType, getDefaultWorkbench } from "@app/types/workbench";
import { ToolId, isValidToolId } from "@app/types/toolId";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { registerUnsavedWorkChecker } from "@app/services/unsavedWork";

/**
 * NavigationContext - Complete navigation management system
 *
 * Handles navigation modes, navigation guards for unsaved changes,
 * and breadcrumb/history navigation. Separated from FileContext to
 * maintain clear separation of concerns.
 */

// Navigation state
interface NavigationContextState {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
}

// Navigation actions
type NavigationAction =
  | { type: "SET_WORKBENCH"; payload: { workbench: WorkbenchType } }
  | { type: "SET_SELECTED_TOOL"; payload: { toolId: ToolId | null } }
  | {
      type: "SET_TOOL_AND_WORKBENCH";
      payload: { toolId: ToolId | null; workbench: WorkbenchType };
    }
  | { type: "SET_UNSAVED_CHANGES"; payload: { hasChanges: boolean } }
  | {
      type: "SET_PENDING_NAVIGATION";
      payload: { navigationFn: (() => void) | null };
    }
  | { type: "SHOW_NAVIGATION_WARNING"; payload: { show: boolean } };

// Navigation reducer
const navigationReducer = (
  state: NavigationContextState,
  action: NavigationAction,
): NavigationContextState => {
  switch (action.type) {
    case "SET_WORKBENCH": {
      const workbench =
        action.payload.workbench === "fileEditor"
          ? "viewer"
          : action.payload.workbench;
      if (state.workbench === workbench) return state;
      return {
        ...state,
        workbench,
      };
    }

    case "SET_SELECTED_TOOL":
      if (state.selectedTool === action.payload.toolId) return state;
      return { ...state, selectedTool: action.payload.toolId };

    case "SET_TOOL_AND_WORKBENCH": {
      const workbench =
        action.payload.workbench === "fileEditor"
          ? "viewer"
          : action.payload.workbench;
      if (
        state.selectedTool === action.payload.toolId &&
        state.workbench === workbench
      )
        return state;
      return {
        ...state,
        selectedTool: action.payload.toolId,
        workbench,
      };
    }

    case "SET_UNSAVED_CHANGES":
      if (state.hasUnsavedChanges === action.payload.hasChanges) return state;
      return { ...state, hasUnsavedChanges: action.payload.hasChanges };

    case "SET_PENDING_NAVIGATION":
      if (state.pendingNavigation === action.payload.navigationFn) return state;
      return { ...state, pendingNavigation: action.payload.navigationFn };

    case "SHOW_NAVIGATION_WARNING":
      if (state.showNavigationWarning === action.payload.show) return state;
      return { ...state, showNavigationWarning: action.payload.show };

    default:
      return state;
  }
};

// Initial state
const initialState: NavigationContextState = {
  workbench: getDefaultWorkbench(),
  selectedTool: null,
  hasUnsavedChanges: false,
  pendingNavigation: null,
  showNavigationWarning: false,
};

// Handlers that editors register for the navigation warning modal
export interface NavigationWarningHandlers {
  onApplyAndContinue?: () => Promise<void>;
  onExportAndContinue?: () => Promise<void>;
  onDiscardAndContinue?: () => Promise<void>;
}

// Navigation context actions interface
export interface NavigationContextActions {
  setWorkbench: (workbench: WorkbenchType) => void;
  /** Reopen a view the user already had, bypassing the unsaved-changes prompt that
   *  guards a user-initiated switch - a restore is not the user leaving anything. */
  restoreWorkbench: (workbench: WorkbenchType) => void;
  setSelectedTool: (toolId: ToolId | null) => void;
  setToolAndWorkbench: (
    toolId: ToolId | null,
    workbench: WorkbenchType,
  ) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  registerUnsavedChangesChecker: (checker: () => boolean) => void;
  unregisterUnsavedChangesChecker: () => void;
  showNavigationWarning: (show: boolean) => void;
  requestNavigation: (navigationFn: () => void) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  clearToolSelection: () => void;
  handleToolSelect: (toolId: string) => void;
  registerNavigationWarningHandlers: (
    handlers: NavigationWarningHandlers,
  ) => void;
  unregisterNavigationWarningHandlers: () => void;
  navigationWarningHandlersRef: React.RefObject<NavigationWarningHandlers | null>;
  /** The path a view was last derived from. Lives here rather than in the page so a
   *  remount (a share link, a login bounce, a Suspense boundary resolving) does not
   *  read an unchanged path as a fresh arrival and re-derive over the user's choice. */
  viewDerivedFromPathRef: React.RefObject<string | null>;
}

// Context state values
export interface NavigationContextStateValue {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
}

export interface NavigationContextActionsValue {
  actions: NavigationContextActions;
}

// Create contexts
const NavigationStateContext = createContext<
  NavigationContextStateValue | undefined
>(undefined);
const SelectedToolContext = createContext<ToolId | null | undefined>(undefined);
type NavigationGuardState = Pick<
  NavigationContextState,
  "pendingNavigation" | "showNavigationWarning" | "hasUnsavedChanges"
>;
const NavigationGuardStateContext = createContext<
  NavigationGuardState | undefined
>(undefined);
/**
 * Exported like {@link FileActionsContext}: a component mounting in both shells must ask whether
 * these exist, and {@link useNavigationActions} throws when they do not.
 */
export const NavigationActionsContext = createContext<
  NavigationContextActionsValue | undefined
>(undefined);

// Provider component
export const NavigationProvider: React.FC<{
  children: React.ReactNode;
  enableUrlSync?: boolean;
}> = ({ children }) => {
  const [state, dispatch] = useReducer(navigationReducer, initialState);
  const { allTools: toolRegistry } = useToolRegistry();
  const stateRef = useRef(state);
  stateRef.current = state;
  const toolRegistryRef = useRef(toolRegistry);
  toolRegistryRef.current = toolRegistry;
  const unsavedChangesCheckerRef = React.useRef<(() => boolean) | null>(null);
  const viewDerivedFromPathRef = useRef<string | null>(null);
  const navigationWarningHandlersRef = useRef<NavigationWarningHandlers | null>(
    null,
  );

  // Memoize individual callbacks
  const setWorkbench = useCallback((workbench: WorkbenchType) => {
    const state = stateRef.current;
    workbench = workbench === "fileEditor" ? "viewer" : workbench;
    // Check for unsaved changes using registered checker or state
    const hasUnsavedChanges =
      unsavedChangesCheckerRef.current?.() || state.hasUnsavedChanges;
    console.log("[NavigationContext] setWorkbench:", {
      from: state.workbench,
      to: workbench,
      hasChecker: !!unsavedChangesCheckerRef.current,
      hasUnsavedChanges,
    });

    // If we're leaving pageEditor, viewer, or custom workbench and have unsaved changes, request navigation
    const leavingWorkbenchWithChanges =
      (state.workbench === "pageEditor" &&
        workbench !== "pageEditor" &&
        hasUnsavedChanges) ||
      (state.workbench === "viewer" &&
        workbench !== "viewer" &&
        hasUnsavedChanges) ||
      (state.workbench.startsWith("custom:") &&
        workbench !== state.workbench &&
        hasUnsavedChanges);

    if (leavingWorkbenchWithChanges) {
      // Update state to reflect unsaved changes so modal knows
      if (!state.hasUnsavedChanges) {
        dispatch({
          type: "SET_UNSAVED_CHANGES",
          payload: { hasChanges: true },
        });
      }
      const performWorkbenchChange = () => {
        // When leaving a custom workbench, clear the selected tool
        console.log("[NavigationContext] performWorkbenchChange executing", {
          from: state.workbench,
          to: workbench,
          isCustom: state.workbench.startsWith("custom:"),
        });
        if (state.workbench.startsWith("custom:")) {
          console.log(
            "[NavigationContext] Clearing tool and changing workbench to:",
            workbench,
          );
          dispatch({
            type: "SET_TOOL_AND_WORKBENCH",
            payload: { toolId: null, workbench },
          });
        } else {
          console.log(
            "[NavigationContext] Just changing workbench to:",
            workbench,
          );
          dispatch({ type: "SET_WORKBENCH", payload: { workbench } });
        }
      };
      dispatch({
        type: "SET_PENDING_NAVIGATION",
        payload: { navigationFn: performWorkbenchChange },
      });
      dispatch({ type: "SHOW_NAVIGATION_WARNING", payload: { show: true } });
    } else {
      dispatch({ type: "SET_WORKBENCH", payload: { workbench } });
    }
  }, []);

  const restoreWorkbench = useCallback((workbench: WorkbenchType) => {
    dispatch({ type: "SET_WORKBENCH", payload: { workbench } });
  }, []);

  const setSelectedTool = useCallback((toolId: ToolId | null) => {
    dispatch({ type: "SET_SELECTED_TOOL", payload: { toolId } });
  }, []);

  const setToolAndWorkbench = useCallback(
    (toolId: ToolId | null, workbench: WorkbenchType) => {
      const state = stateRef.current;
      workbench = workbench === "fileEditor" ? "viewer" : workbench;
      // Check for unsaved changes using registered checker or state
      const hasUnsavedChanges =
        unsavedChangesCheckerRef.current?.() || state.hasUnsavedChanges;

      // If we're leaving pageEditor, viewer, or custom workbench and have unsaved changes, request navigation
      const leavingWorkbenchWithChanges =
        (state.workbench === "pageEditor" &&
          workbench !== "pageEditor" &&
          hasUnsavedChanges) ||
        (state.workbench === "viewer" &&
          workbench !== "viewer" &&
          hasUnsavedChanges) ||
        (state.workbench.startsWith("custom:") &&
          workbench !== state.workbench &&
          hasUnsavedChanges);

      if (leavingWorkbenchWithChanges) {
        const performWorkbenchChange = () => {
          dispatch({
            type: "SET_TOOL_AND_WORKBENCH",
            payload: { toolId, workbench },
          });
        };
        dispatch({
          type: "SET_PENDING_NAVIGATION",
          payload: { navigationFn: performWorkbenchChange },
        });
        dispatch({ type: "SHOW_NAVIGATION_WARNING", payload: { show: true } });
      } else {
        dispatch({
          type: "SET_TOOL_AND_WORKBENCH",
          payload: { toolId, workbench },
        });
      }
    },
    [],
  );

  const setHasUnsavedChanges = useCallback((hasChanges: boolean) => {
    dispatch({ type: "SET_UNSAVED_CHANGES", payload: { hasChanges } });
  }, []);

  // Same answer the navigation guard uses, published where the disk reconciliation
  // can reach it: without this an external edit replaces the bytes under an open
  // page editor, annotation or redaction session with no conflict prompt.
  React.useEffect(
    () =>
      registerUnsavedWorkChecker(
        () =>
          unsavedChangesCheckerRef.current?.() === true ||
          state.hasUnsavedChanges,
      ),
    [state.hasUnsavedChanges],
  );

  const registerUnsavedChangesChecker = useCallback(
    (checker: () => boolean) => {
      unsavedChangesCheckerRef.current = checker;
    },
    [],
  );

  const unregisterUnsavedChangesChecker = useCallback(() => {
    unsavedChangesCheckerRef.current = null;
  }, []);

  const registerNavigationWarningHandlers = useCallback(
    (handlers: NavigationWarningHandlers) => {
      navigationWarningHandlersRef.current = handlers;
    },
    [],
  );

  const unregisterNavigationWarningHandlers = useCallback(() => {
    navigationWarningHandlersRef.current = null;
  }, []);

  const showNavigationWarning = useCallback((show: boolean) => {
    dispatch({ type: "SHOW_NAVIGATION_WARNING", payload: { show } });
  }, []);

  const requestNavigation = useCallback((navigationFn: () => void) => {
    const state = stateRef.current;
    const hasUnsavedChanges =
      unsavedChangesCheckerRef.current?.() || state.hasUnsavedChanges;
    if (!hasUnsavedChanges) {
      navigationFn();
      return;
    }

    dispatch({ type: "SET_UNSAVED_CHANGES", payload: { hasChanges: true } });
    dispatch({ type: "SET_PENDING_NAVIGATION", payload: { navigationFn } });
    dispatch({ type: "SHOW_NAVIGATION_WARNING", payload: { show: true } });
  }, []);

  const confirmNavigation = useCallback(() => {
    const state = stateRef.current;
    console.log("[NavigationContext] confirmNavigation called", {
      hasPendingNav: !!state.pendingNavigation,
      currentWorkbench: state.workbench,
      currentTool: state.selectedTool,
    });
    if (state.pendingNavigation) {
      state.pendingNavigation();
    }

    dispatch({
      type: "SET_PENDING_NAVIGATION",
      payload: { navigationFn: null },
    });
    dispatch({ type: "SHOW_NAVIGATION_WARNING", payload: { show: false } });
    console.log("[NavigationContext] confirmNavigation completed");
  }, []);

  const cancelNavigation = useCallback(() => {
    dispatch({
      type: "SET_PENDING_NAVIGATION",
      payload: { navigationFn: null },
    });
    dispatch({ type: "SHOW_NAVIGATION_WARNING", payload: { show: false } });
  }, []);

  const clearToolSelection = useCallback(() => {
    dispatch({
      type: "SET_TOOL_AND_WORKBENCH",
      payload: { toolId: null, workbench: getDefaultWorkbench() },
    });
  }, []);

  const handleToolSelect = useCallback((toolId: string) => {
    const state = stateRef.current;
    const toolRegistry = toolRegistryRef.current;
    const performToolSelect = () => {
      if (toolId === "allTools") {
        dispatch({
          type: "SET_TOOL_AND_WORKBENCH",
          payload: { toolId: null, workbench: getDefaultWorkbench() },
        });
        return;
      }

      if (toolId === "read" || toolId === "view-pdf") {
        dispatch({
          type: "SET_TOOL_AND_WORKBENCH",
          payload: { toolId: null, workbench: "viewer" },
        });
        return;
      }

      // Look up the tool in the registry to get its proper workbench.
      // Regular tools have no workbench preference — keep the current view so
      // opening a tool doesn't unexpectedly switch the user to the viewer.
      const tool = isValidToolId(toolId) ? toolRegistry[toolId] : null;
      const workbench =
        tool && tool.workbench ? tool.workbench : state.workbench;

      // Validate toolId and convert to ToolId type
      const validToolId = isValidToolId(toolId) ? toolId : null;
      dispatch({
        type: "SET_TOOL_AND_WORKBENCH",
        payload: { toolId: validToolId, workbench },
      });
    };

    // Check for unsaved changes using registered checker or state
    const hasUnsavedChanges =
      unsavedChangesCheckerRef.current?.() || state.hasUnsavedChanges;

    // If switching away from current tool and have unsaved changes, show warning
    if (
      hasUnsavedChanges &&
      state.selectedTool &&
      state.selectedTool !== toolId
    ) {
      dispatch({
        type: "SET_PENDING_NAVIGATION",
        payload: { navigationFn: performToolSelect },
      });
      dispatch({ type: "SHOW_NAVIGATION_WARNING", payload: { show: true } });
    } else {
      performToolSelect();
    }
  }, []);

  // Memoize the actions object to prevent unnecessary context updates
  // This is critical to avoid infinite loops when effects depend on actions
  const actions: NavigationContextActions = useMemo(
    () => ({
      setWorkbench,
      restoreWorkbench,
      setSelectedTool,
      setToolAndWorkbench,
      setHasUnsavedChanges,
      registerUnsavedChangesChecker,
      unregisterUnsavedChangesChecker,
      showNavigationWarning,
      requestNavigation,
      confirmNavigation,
      cancelNavigation,
      clearToolSelection,
      handleToolSelect,
      registerNavigationWarningHandlers,
      unregisterNavigationWarningHandlers,
      navigationWarningHandlersRef,
      viewDerivedFromPathRef,
    }),
    [
      setWorkbench,
      restoreWorkbench,
      setSelectedTool,
      setToolAndWorkbench,
      setHasUnsavedChanges,
      registerUnsavedChangesChecker,
      unregisterUnsavedChangesChecker,
      showNavigationWarning,
      requestNavigation,
      confirmNavigation,
      cancelNavigation,
      clearToolSelection,
      handleToolSelect,
      registerNavigationWarningHandlers,
      unregisterNavigationWarningHandlers,
    ],
  );

  const stateValue: NavigationContextStateValue = state;
  const guardState = useMemo(
    () => ({
      pendingNavigation: state.pendingNavigation,
      showNavigationWarning: state.showNavigationWarning,
      hasUnsavedChanges: state.hasUnsavedChanges,
    }),
    [
      state.pendingNavigation,
      state.showNavigationWarning,
      state.hasUnsavedChanges,
    ],
  );

  // Also memoize the context value to prevent unnecessary re-renders
  const actionsValue: NavigationContextActionsValue = useMemo(
    () => ({
      actions,
    }),
    [actions],
  );

  return (
    <NavigationStateContext.Provider value={stateValue}>
      <SelectedToolContext.Provider value={state.selectedTool}>
        <NavigationGuardStateContext.Provider value={guardState}>
          <NavigationActionsContext.Provider value={actionsValue}>
            {children}
          </NavigationActionsContext.Provider>
        </NavigationGuardStateContext.Provider>
      </SelectedToolContext.Provider>
    </NavigationStateContext.Provider>
  );
};

// Navigation hooks
export const useNavigationState = () => {
  const context = useContext(NavigationStateContext);
  if (context === undefined) {
    throw new Error(
      "useNavigationState must be used within NavigationProvider",
    );
  }
  return context;
};

export const useNavigationActions = () => {
  const context = useContext(NavigationActionsContext);
  if (context === undefined) {
    throw new Error(
      "useNavigationActions must be used within NavigationProvider",
    );
  }
  return context;
};

/** Subscribe to tool changes without refreshing on workbench or dirty-state changes. */
export const useSelectedTool = () => {
  const tool = useContext(SelectedToolContext);
  if (tool === undefined)
    throw new Error("useSelectedTool must be used within NavigationProvider");
  return tool;
};

// Combined hook for convenience
export const useNavigation = () => {
  const state = useNavigationState();
  const { actions } = useNavigationActions();
  return { ...state, ...actions };
};

// Navigation guard hook (equivalent to old useFileNavigation)
export const useNavigationGuard = () => {
  const state = useContext(NavigationGuardStateContext);
  if (!state)
    throw new Error(
      "useNavigationGuard must be used within NavigationProvider",
    );
  const { actions } = useNavigationActions();

  return {
    pendingNavigation: state.pendingNavigation,
    showNavigationWarning: state.showNavigationWarning,
    hasUnsavedChanges: state.hasUnsavedChanges,
    requestNavigation: actions.requestNavigation,
    confirmNavigation: actions.confirmNavigation,
    cancelNavigation: actions.cancelNavigation,
    setHasUnsavedChanges: actions.setHasUnsavedChanges,
    setShowNavigationWarning: actions.showNavigationWarning,
    registerUnsavedChangesChecker: actions.registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker: actions.unregisterUnsavedChangesChecker,
    registerNavigationWarningHandlers:
      actions.registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers:
      actions.unregisterNavigationWarningHandlers,
    navigationWarningHandlersRef: actions.navigationWarningHandlersRef,
    viewDerivedFromPathRef: actions.viewDerivedFromPathRef,
  };
};
