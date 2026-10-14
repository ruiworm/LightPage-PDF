import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import HomePage from "@app/pages/HomePage";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { stripBasePath } from "@app/constants/app";
import { DOCS_PATH, HAS_DOCS } from "@app/routes/docsRoute";
import { StartupPrompts } from "@app/components/startup/StartupPrompts";
import { RetainedView } from "@app/components/layout/RetainedView";

// Their own chunks: the settings tree (admin sections, account, licence flows)
// and the docs manifest are both large, and most sessions open neither.
const SettingsPage = lazy(() => import("@app/pages/SettingsPage"));
const ToolLibraryPage = lazy(() => import("@app/pages/ToolLibraryPage"));
const DocsPage = lazy(() => import("@app/components/docs/DocsPage"));

function AppContent() {
  const { pathname } = useLocation();
  const path = stripBasePath(pathname);

  const page =
    path === "/tools" || path === "/tools/" ? (
      <ToolLibraryPage />
    ) : path.startsWith("/settings") ? (
      <SettingsPage />
    ) : HAS_DOCS && path.startsWith(DOCS_PATH) ? (
      <DocsPage />
    ) : null;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <RetainedView active={page === null}>
        <HomePage />
      </RetainedView>
      {page && <Suspense fallback={<LoadingFallback />}>{page}</Suspense>}
    </div>
  );
}

/** The editor's authenticated or login-disabled routes, including catch-all entries. */
export function AppRoot() {
  return (
    <>
      <StartupPrompts />
      <AppContent />
    </>
  );
}
