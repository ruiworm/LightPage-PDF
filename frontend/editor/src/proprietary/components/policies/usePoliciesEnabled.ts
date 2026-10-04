import { useAppConfig } from "@app/contexts/AppConfigContext";

/** Account-owned policies are unavailable in a login-free local library. */
export function usePoliciesEnabled(): boolean {
  const { config } = useAppConfig();
  return config?.enableLogin === true;
}
