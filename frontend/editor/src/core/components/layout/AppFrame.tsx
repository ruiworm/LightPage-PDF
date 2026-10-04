import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import {
  QuickNavHostProvider,
  useQuickNavHost,
} from "@app/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import { TitleBarChrome } from "@app/components/layout/TitleBarChrome";
import "@app/components/layout/AppFrame.css";

function AppFrameContent() {
  const host = useQuickNavHost();
  const navigationVisible = Boolean(host?.appMounted && !host.chromeless);

  return (
    <div className="app-frame" data-navigation={navigationVisible}>
      <QuickNavRailHost />
      <div className="app-frame__content">
        <Suspense fallback={<LoadingFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

/** Chrome persists across apps and remains outside the route's Suspense boundary. */
export function AppFrame() {
  return (
    <QuickNavHostProvider>
      <TitleBarChrome>
        <AppFrameContent />
      </TitleBarChrome>
    </QuickNavHostProvider>
  );
}
