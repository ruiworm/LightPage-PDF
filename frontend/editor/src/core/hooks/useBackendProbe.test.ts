import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useBackendProbe } from "@app/hooks/useBackendProbe";

vi.mock("@app/constants/app", () => ({ BASE_PATH: "/pdf" }));

const fetchMock = vi.fn();
const jsonResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValueOnce(jsonResponse({ status: "UP" }));
});

afterEach(() => vi.unstubAllGlobals());

describe("useBackendProbe on a healthy backend", () => {
  it.each([false, true])(
    "reads enableLogin=%s from the public config even when health is UP",
    async (enableLogin) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ enableLogin }));
      const { result } = renderHook(() => useBackendProbe());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.status).toBe("up");
      expect(result.current.loginDisabled).toBe(!enableLogin);
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/pdf/api/v1/config/app-config",
        { method: "GET", cache: "no-store" },
      );
    },
  );

  it.each([401, 403, 404, 503])(
    "keeps login enabled when config responds with %s",
    async (status) => {
      fetchMock.mockResolvedValueOnce({ ok: false, status });
      const { result } = renderHook(() => useBackendProbe());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.status).toBe("up");
      expect(result.current.loginDisabled).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["missing", "malformed", "unreachable"])(
    "keeps login enabled when config is %s",
    async (failure) => {
      if (failure === "missing") {
        fetchMock.mockResolvedValueOnce(jsonResponse({}));
      } else if (failure === "malformed") {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => {
            throw new SyntaxError("Invalid JSON");
          },
        });
      } else {
        fetchMock.mockRejectedValueOnce(new TypeError("Network error"));
      }
      const { result } = renderHook(() => useBackendProbe());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.status).toBe("up");
      expect(result.current.loginDisabled).toBe(false);
    },
  );
});
