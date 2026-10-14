import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { lazyWithPreload, preloadComponent } from "@app/utils/lazyWithPreload";

describe("tool code preloading", () => {
  it("loads once without mounting or executing the tool", async () => {
    const mounted = vi.fn();
    const load = vi.fn(async () => ({
      default: () => {
        mounted();
        return <div>Ready tool</div>;
      },
    }));
    const Tool = lazyWithPreload(load);
    await preloadComponent(Tool);
    await preloadComponent(Tool);
    expect(load).toHaveBeenCalledTimes(1);
    expect(mounted).not.toHaveBeenCalled();
    render(
      <Suspense fallback="Loading">
        <Tool />
      </Suspense>,
    );
    await screen.findByText("Ready tool");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries a failed preload when the tool is opened later", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary connection failure"))
      .mockResolvedValue({ default: () => <div>Retry succeeded</div> });
    const Tool = lazyWithPreload(load);
    await expect(preloadComponent(Tool)).rejects.toThrow(
      "temporary connection failure",
    );
    render(
      <Suspense fallback="Loading">
        <Tool />
      </Suspense>,
    );
    await screen.findByText("Retry succeeded");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
