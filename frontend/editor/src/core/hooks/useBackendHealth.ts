import { useSyncExternalStore } from "react";
import { backendHealthMonitor } from "@app/services/backendHealthMonitor";
import type { BackendHealthState } from "@app/types/backendHealth";

export function useBackendHealth(): BackendHealthState {
  return useSyncExternalStore(
    backendHealthMonitor.subscribe,
    backendHealthMonitor.getSnapshot,
    backendHealthMonitor.getServerSnapshot,
  );
}
