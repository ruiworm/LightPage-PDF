import { act, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import ToolLoadingFallback from "@app/components/tools/ToolLoadingFallback";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values: { toolName: string }) =>
      fallback.replace("{{toolName}}", values?.toolName ?? ""),
  }),
}));

describe("tool loading feedback", () => {
  afterEach(() => vi.useRealTimers());

  it("only shows feedback for a wait that lasts beyond 180 ms", () => {
    vi.useFakeTimers();
    const app = render(
      <MantineProvider>
        <ToolLoadingFallback toolName="Compress" />
      </MantineProvider>,
    );
    expect(screen.queryByText("Loading Compress...")).toBeNull();
    act(() => vi.advanceTimersByTime(179));
    expect(screen.queryByText("Loading Compress...")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Loading Compress...")).toBeInTheDocument();
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the timer when loading finishes quickly", () => {
    vi.useFakeTimers();
    const app = render(
      <MantineProvider>
        <ToolLoadingFallback />
      </MantineProvider>,
    );
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
