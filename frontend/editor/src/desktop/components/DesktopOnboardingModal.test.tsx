import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { DesktopOnboardingModal } from "@app/components/DesktopOnboardingModal";

const { isAuthenticated } = vi.hoisted(() => ({
  isAuthenticated: vi.fn<() => Promise<boolean>>(),
}));
const { automationEnabled, switchToLocal } = vi.hoisted(() => ({
  automationEnabled: vi.fn(() => false),
  switchToLocal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@app/components/policies/usePoliciesEnabled", () => ({
  usePoliciesEnabled: automationEnabled,
}));

vi.mock("@app/services/authService", () => ({
  authService: { isAuthenticated },
}));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { switchToLocal },
}));

vi.mock("@app/components/onboarding/OnboardingSlideShell", () => ({
  default: ({
    opened,
    body,
    onClose,
  }: {
    opened: boolean;
    body: ReactNode;
    onClose: () => void;
  }) =>
    opened ? (
      <div role="dialog">
        Desktop onboarding{body}
        <button onClick={onClose}>Continue</button>
      </div>
    ) : null,
  ShellHero: () => null,
}));

vi.mock("@app/components/SetupWizard", () => ({
  SetupWizard: ({ onComplete }: { onComplete: () => void }) => (
    <div>
      Sign in to a server<button onClick={onComplete}>Skip sign-in</button>
    </div>
  ),
}));

vi.mock("@app/components/onboarding/slides/WelcomeSlide", () => ({
  default: () => ({ title: "Welcome", body: null }),
}));

vi.mock(
  "@app/components/onboarding/classificationDemo/ClassificationDemoModal",
  () => ({
    ClassificationDemoModal: () => <div role="dialog">Downloads demo</div>,
  }),
);

function renderModal() {
  return render(
    <MemoryRouter>
      <DesktopOnboardingModal />
    </MemoryRouter>,
  );
}

describe("DesktopOnboardingModal", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    isAuthenticated.mockReset().mockResolvedValue(true);
    automationEnabled.mockReturnValue(false);
  });

  it("keeps onboarding disabled for a new desktop user", async () => {
    await act(async () => {
      renderModal();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("honours the shared onboarding bypass", async () => {
    sessionStorage.setItem("onboarding::bypass-all", "true");

    renderModal();

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps an unsigned local user out of sign-in prompts and demos", async () => {
    isAuthenticated.mockResolvedValue(false);
    await act(async () => {
      renderModal();
    });
    expect(screen.queryByText("Sign in to a server")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(switchToLocal).not.toHaveBeenCalled();
  });

  it("does not reopen a classification demo when policy availability changes", async () => {
    localStorage.setItem("stirling-desktop-onboarding-seen.v2", "true");
    let view: ReturnType<typeof renderModal>;
    await act(async () => {
      view = renderModal();
    });
    expect(screen.queryByText("Downloads demo")).not.toBeInTheDocument();
    automationEnabled.mockReturnValue(true);
    view!.rerender(
      <MemoryRouter>
        <DesktopOnboardingModal />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Downloads demo")).not.toBeInTheDocument();
  });
});
