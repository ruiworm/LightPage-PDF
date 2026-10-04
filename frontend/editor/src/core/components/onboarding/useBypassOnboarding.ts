import { useEffect } from "react";
import { markOnboardingCompleted } from "@app/components/onboarding/orchestrator/onboardingStorage";

/**
 * Onboarding disabled: marks onboarding as completed immediately
 * and always returns true to bypass tours and intro modal slides.
 */
export function useBypassOnboarding(): boolean {
  useEffect(() => {
    markOnboardingCompleted();
  }, []);

  return true;
}
