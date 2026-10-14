import { lazy } from "react";

type LazyComponent = Awaited<ReturnType<Parameters<typeof lazy>[0]>>["default"];

export function lazyWithPreload<T extends LazyComponent>(
  load: () => Promise<{ default: T }>,
) {
  let pending: Promise<{ default: T }> | undefined;
  const preload = () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
  return Object.assign(lazy(preload), { preload });
}

/** Loading code does not mount the tool or start its file operation. */
export async function preloadComponent(component: unknown): Promise<void> {
  if (
    component &&
    typeof component === "object" &&
    "preload" in component &&
    typeof component.preload === "function"
  ) {
    await component.preload();
  }
}
