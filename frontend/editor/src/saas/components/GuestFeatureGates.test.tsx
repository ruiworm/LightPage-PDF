import { beforeEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";

const state = vi.hoisted(() => ({
  user: { id: "guest" } as { id: string } | null,
  loading: false,
  isAnonymous: true,
}));

vi.mock("@app/auth/UseSession", () => ({ useAuth: () => state }));

beforeEach(() => {
  state.user = { id: "guest" };
  state.loading = false;
  state.isAnonymous = true;
});

it("keeps the policy controller, including local classification, disabled until registered login", () => {
  const { result, rerender } = renderHook(() => usePoliciesEnabled());
  expect(result.current).toBe(false);
  state.isAnonymous = false;
  state.loading = true;
  rerender();
  expect(result.current).toBe(false);
  state.loading = false;
  rerender();
  expect(result.current).toBe(true);
  state.user = null;
  rerender();
  expect(result.current).toBe(false);
});
