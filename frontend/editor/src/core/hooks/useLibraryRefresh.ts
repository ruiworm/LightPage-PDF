import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useFolders } from "@app/contexts/FolderContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";

/**
 * Re-read the library's storage authorities; server sync requires enabled
 * account storage. Local folders can refresh without a server session.
 */
export function useLibraryRefresh(): {
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const { t } = useTranslation();
  const folders = useFolders();
  const { config } = useAppConfig();
  const { isAnonymous } = useAuth();
  const syncEnabled = config?.storageEnabled === true && !isAnonymous;
  const { refresh, bumpDiskRevision } = useFilesPage();
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    setRefreshing(true);
    try {
      // pullFromServer bumps the folder revision, which the FolderProvider's effect
      // reacts to by re-running refresh() - no need to await folders.refresh() here.
      if (syncEnabled) {
        const result = await folders.pullFromServer();
        if (!result.ok && result.reason !== "endpoint-missing") {
          folders.setError(
            result.reason === "network"
              ? t("filesPage.syncError.network", "Could not reach the server.")
              : result.reason === "server"
                ? t(
                    "filesPage.syncError.server",
                    "Server error during folder sync.",
                  )
                : t("filesPage.syncError.client", "Folder sync failed."),
          );
        }
      } else {
        await folders.refresh();
      }
      // A mount is listed from the disk, which no amount of server syncing re-reads.
      bumpDiskRevision();
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [folders, refresh, bumpDiskRevision, syncEnabled, t]);

  return { refreshing, refresh: run };
}
