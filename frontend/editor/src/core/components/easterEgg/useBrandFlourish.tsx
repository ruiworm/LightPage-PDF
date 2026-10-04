import { type ReactNode } from "react";

export interface BrandFlourish {
  trigger?: (originRect: DOMRect | null) => void;
  overlay: ReactNode;
}

/**
 * Brand flourish / Easter egg disabled.
 */
export function useBrandFlourish(): BrandFlourish {
  return {
    trigger: undefined,
    overlay: null,
  };
}
