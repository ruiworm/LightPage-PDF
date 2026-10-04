import { afterEach, describe, expect, it, vi } from "vitest";
import TomlBackend from "@app/i18n/tomlBackend";

afterEach(() => vi.unstubAllGlobals());

function loadTranslation(language: string, content: string): Promise<unknown> {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(content),
    }),
  );
  const backend = new TomlBackend(undefined, {
    loadPath: "/locales/{{lng}}/{{ns}}.toml",
  });
  return new Promise((resolve, reject) => {
    backend.read(language, "translation", (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

describe("localized product branding", () => {
  it("uses the Chinese brand in Chinese welcome text", async () => {
    const data = await loadTranslation(
      "zh-CN",
      'welcome = "欢迎使用 Stirling PDF"\nlabel = "Stirling-PDF"',
    );
    expect(data).toEqual({ welcome: "欢迎使用 轻页 PDF", label: "轻页 PDF" });
  });

  it("uses the English brand in other locales", async () => {
    const data = await loadTranslation(
      "en-US",
      'welcome = "Welcome to Stirling"\nlabel = "Stirling PDF"',
    );
    expect(data).toEqual({
      welcome: "Welcome to LightPage PDF",
      label: "LightPage PDF",
    });
  });

  it("preserves company attribution, cloud services, URLs, and keys", async () => {
    const data = await loadTranslation(
      "zh-CN",
      `company = "Stirling PDF Inc."
cloud = "Stirling Cloud"
repository = "https://github.com/Stirling-Tools/Stirling-PDF"
stirling_name = "Stirling"
other = "Open your document"`,
    );
    expect(data).toEqual({
      company: "Stirling PDF Inc.",
      cloud: "Stirling Cloud",
      repository: "https://github.com/Stirling-Tools/Stirling-PDF",
      stirling_name: "轻页 PDF",
      other: "Open your document",
    });
    expect(fetch).toHaveBeenCalledWith("/locales/zh-CN/translation.toml");
  });
});
