import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyProvider, useHotkeys } from "@app/contexts/HotkeyContext";
import { HotkeysCard } from "@app/components/shared/config/configSections/preferences/HotkeysCard";
import HotkeysSection from "@app/components/shared/config/configSections/HotkeysSection";
import {
  SubcategoryId,
  ToolCategoryId,
  type ToolRegistry,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";

const selectTool = vi.fn();
const makeTool = (
  name: string,
  overrides: Partial<ToolRegistryEntry> = {},
): ToolRegistryEntry => ({
  name,
  description: `${name} description`,
  icon: null,
  component: () => null,
  automationSettings: null,
  categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
  subcategoryId: SubcategoryId.GENERAL,
  ...overrides,
});
let registry: Partial<ToolRegistry>;
const storedBinding = { code: "KeyQ", ctrl: true, alt: true };
const activeBinding = { code: "KeyR", ctrl: true, alt: true };

vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    toolRegistry: registry,
    handleToolSelect: selectTool,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  selectTool.mockClear();
  registry = {
    automate: makeTool("Retired automation", { hiddenFromToolList: true }),
    classify: makeTool("Pipeline placeholder", { component: null }),
    merge: makeTool("Merge PDF"),
    multiTool: makeTool("Organize pages", { component: null }),
    rotate: makeTool("Rotate pages", {
      categoryId: ToolCategoryId.STANDARD_TOOLS,
    }),
  };
});

function renderHotkeys() {
  return renderHook(() => useHotkeys(), { wrapper: HotkeyProvider });
}

describe("shortcuts for current interactive tools", () => {
  it("excludes hidden tools and placeholders without consuming default digits", () => {
    const { result } = renderHotkeys();
    expect(result.current.tools.map(([id]) => id)).toEqual([
      "merge",
      "multiTool",
      "rotate",
    ]);
    expect(result.current.defaults.merge?.code).toBe("Digit1");
    expect(result.current.defaults.multiTool?.code).toBe("Digit2");
    expect(result.current.defaults.automate).toBeUndefined();
    expect(result.current.defaults.classify).toBeUndefined();
  });

  it("prunes retired saved shortcuts while preserving active custom shortcuts", () => {
    localStorage.setItem(
      "stirlingpdf.hotkeys",
      JSON.stringify({
        automate: storedBinding,
        classify: storedBinding,
        deletedTool: storedBinding,
        rotate: activeBinding,
      }),
    );
    const { result } = renderHotkeys();
    expect(JSON.parse(localStorage.getItem("stirlingpdf.hotkeys")!)).toEqual({
      rotate: activeBinding,
    });
    expect(result.current.isBindingAvailable(storedBinding)).toBe(true);
    expect(result.current.isBindingAvailable(activeBinding)).toBe(false);
    expect(result.current.hotkeys.rotate).toMatchObject(activeBinding);

    const retiredEvent = new KeyboardEvent("keydown", {
      code: "KeyQ",
      ctrlKey: true,
      altKey: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(retiredEvent));
    expect(selectTool).not.toHaveBeenCalled();
    expect(retiredEvent.defaultPrevented).toBe(false);

    fireEvent.keyDown(window, { code: "KeyR", ctrlKey: true, altKey: true });
    expect(selectTool).toHaveBeenCalledWith("rotate");
  });

  it("removes an active binding when its tool becomes hidden", () => {
    localStorage.setItem(
      "stirlingpdf.hotkeys",
      JSON.stringify({ rotate: activeBinding }),
    );
    const { result, rerender } = renderHotkeys();
    registry = {
      ...registry,
      rotate: makeTool("Rotate pages", { hiddenFromToolList: true }),
    };
    rerender();
    expect(result.current.hotkeys.rotate).toBeUndefined();
    expect(result.current.isBindingAvailable(activeBinding)).toBe(true);
    expect(JSON.parse(localStorage.getItem("stirlingpdf.hotkeys")!)).toEqual(
      {},
    );
  });

  it("supports rebinding and resetting surviving tools, including organize", () => {
    const { result } = renderHotkeys();
    act(() => result.current.updateHotkey("multiTool", activeBinding));
    fireEvent.keyDown(window, { code: "KeyR", ctrlKey: true, altKey: true });
    expect(selectTool).toHaveBeenLastCalledWith("multiTool");
    act(() => result.current.resetHotkey("multiTool"));
    expect(result.current.hotkeys.multiTool).toEqual(
      result.current.defaults.multiTool,
    );
    expect(JSON.parse(localStorage.getItem("stirlingpdf.hotkeys")!)).toEqual(
      {},
    );
  });

  it("cannot reassign hidden tools or interrupt typing in an input", () => {
    const { result } = renderHotkeys();
    act(() => result.current.updateHotkey("automate", activeBinding));
    expect(result.current.hotkeys.automate).toBeUndefined();
    expect(JSON.parse(localStorage.getItem("stirlingpdf.hotkeys")!)).toEqual(
      {},
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { code: "Digit1", ctrlKey: true, altKey: true });
    input.remove();
    expect(selectTool).not.toHaveBeenCalled();
  });

  it.each([HotkeysCard, HotkeysSection])(
    "shows only current tools in the shortcut settings (%#)",
    (Settings) => {
      render(
        <MantineProvider>
          <HotkeyProvider>
            <Settings />
          </HotkeyProvider>
        </MantineProvider>,
      );
      expect(screen.getByText("Merge PDF")).toBeInTheDocument();
      expect(screen.getByText("Organize pages")).toBeInTheDocument();
      expect(screen.getByText("Rotate pages")).toBeInTheDocument();
      expect(screen.queryByText("Retired automation")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Pipeline placeholder"),
      ).not.toBeInTheDocument();
    },
  );
});
