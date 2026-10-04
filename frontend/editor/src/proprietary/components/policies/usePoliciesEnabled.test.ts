import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";

const state = vi.hoisted(() => ({
  enableLogin: undefined as boolean | undefined,
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { enableLogin: state.enableLogin } }),
}));

it.each([undefined, false, true])(
  "enables account policies only after login is explicitly enabled: %s",
  (enableLogin) => {
    state.enableLogin = enableLogin;
    const { result } = renderHook(usePoliciesEnabled);
    expect(result.current).toBe(enableLogin === true);
  },
);
