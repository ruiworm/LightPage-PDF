import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface OfficeStatus {
  supported: boolean;
  installed: boolean;
  restartRequired: boolean;
  version: string;
  downloadBytes: number;
  installedBytes: number;
}

interface InstallProgress {
  phase: "download" | "verify" | "extract";
  completed: number;
  total: number;
}

interface ComponentState {
  status: OfficeStatus | null;
  busy: boolean;
  progress: InstallProgress | null;
  error: string | null;
}

let state: ComponentState = {
  status: null,
  busy: false,
  progress: null,
  error: null,
};
const subscribers = new Set<() => void>();
let refreshPromise: Promise<void> | null = null;

function update(next: Partial<ComponentState>) {
  state = { ...state, ...next };
  subscribers.forEach((notify) => notify());
}

/** Refresh native availability; concurrent panels share the same request. */
export function refreshOfficeComponent(): Promise<void> {
  if (state.busy) return Promise.resolve();
  refreshPromise ??= invoke<OfficeStatus>("get_office_component_status")
    .then((status) => update({ status, error: null }))
    .catch((error: unknown) => update({ error: String(error) }))
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/** Keep the installation alive across panel changes, with a single native progress listener. */
export async function installOfficeComponent(): Promise<void> {
  if (state.busy) return;
  update({ busy: true, error: null, progress: null });
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listen<InstallProgress>(
      "office-component-progress",
      ({ payload }) => update({ progress: payload }),
    );
    const status = await invoke<OfficeStatus>("install_office_component");
    update({ status });
  } catch (error) {
    update({ error: String(error) });
  } finally {
    unlisten?.();
    update({ busy: false, progress: null });
  }
}

/** Subscribe to shared installation state, including downloads started in another panel. */
export function useOfficeComponent() {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
    () => state,
  );
}
