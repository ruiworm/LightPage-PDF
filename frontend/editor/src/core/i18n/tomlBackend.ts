import { BackendModule, ReadCallback } from "i18next";
import { parse } from "smol-toml";

/**
 * i18next backend that loads TOML translation files over HTTP. Shared by the
 * editor and portal so both apps consume the same locale format and the same
 * Crowdin-managed `public/locales/{lng}/{ns}.toml` layout.
 */
export interface TomlBackendOptions {
  loadPath: string | ((lngs: string[], namespaces: string[]) => string);
}

class TomlBackend implements BackendModule<TomlBackendOptions> {
  static type = "backend" as const;
  type = "backend" as const;

  constructor(services?: unknown, options?: TomlBackendOptions) {
    this.init(services, options);
  }

  init(_services?: unknown, options?: TomlBackendOptions): void {
    this.options = options;
  }

  read(language: string, namespace: string, callback: ReadCallback): void {
    const loadPath = this.options?.loadPath;

    if (!loadPath) {
      callback(new Error("loadPath is not configured"), null);
      return;
    }

    const url =
      typeof loadPath === "function"
        ? loadPath([language], [namespace])
        : loadPath.replace("{{lng}}", language).replace("{{ns}}", namespace);

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load translation file: ${url} (${response.status})`,
          );
        }
        return response.text();
      })
      .then((tomlContent) => {
        // Localize product identity while keeping Crowdin files, vendor names,
        // translation keys, and upstream URLs intact.
        const brandName = language.startsWith("zh")
          ? "轻页 PDF"
          : "LightPage PDF";
        const brandedContent = tomlContent
          .replace(/(?<![\w/.-])Stirling[- ]PDF\b(?![-\w/]|\s+Inc)/g, brandName)
          .replace(
            /(?<![\w/.-])Stirling\b(?![-\w/]|\s+(?:PDF|Cloud|Inc))/g,
            brandName,
          );
        const parsed = parse(brandedContent);
        callback(null, parsed);
      })
      .catch((error) => {
        callback(error, null);
      });
  }

  private options?: TomlBackendOptions;
}

export default TomlBackend;
