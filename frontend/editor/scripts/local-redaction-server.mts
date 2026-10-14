import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { PluginOption } from "vite";

/** Development only: reuse an existing local service, or start installed weights without downloads. */
export function localRedactionServer(
  engineRoot: string,
  configuredUrl?: string,
): PluginOption {
  let child: ChildProcess | undefined;
  return {
    name: "local-redaction-server",
    apply: "serve",
    async configureServer(server) {
      if (!configuredUrl) return;
      let url: URL;
      try {
        url = new URL(configuredUrl);
      } catch {
        return;
      }
      if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        url.port !== "5161"
      )
        return;
      const python = join(
        engineRoot,
        ".venv-redaction",
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      );
      try {
        await Promise.all([
          access(python),
          access(
            join(engineRoot, ".model_cache/redaction-raner/pytorch_model.bin"),
          ),
        ]);
      } catch {
        return;
      }
      try {
        const response = await fetch(new URL("/health", url), {
          signal: AbortSignal.timeout(2500),
        });
        if (response.ok) return;
        server.config.logger.warn(
          "Local recognition port is in use; automatic start was skipped.",
        );
        return;
      } catch {
        /* No service running yet. */
      }
      child = spawn(python, ["-X", "utf8", "-m", "stirling.redaction.server"], {
        cwd: engineRoot,
        env: {
          ...process.env,
          PYTHONPATH: join(engineRoot, "src"),
          HF_HUB_OFFLINE: "1",
        },
        windowsHide: true,
        stdio: "ignore",
      });
      child.on("error", () =>
        server.config.logger.warn(
          "Local enhanced recognition could not start. Field recognition remains available.",
        ),
      );
      server.httpServer?.once("close", () => {
        if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
          return;
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
            windowsHide: true,
            stdio: "ignore",
          });
        } else child.kill();
      });
    },
  };
}
