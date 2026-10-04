import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BASE_PATH } from "@app/constants/app";

const LOGO_FOLDER = "modern-logo";

export function useLogoAssets() {
  const { i18n } = useTranslation();
  const isChinese = (i18n.resolvedLanguage || i18n.language || "").startsWith(
    "zh",
  );
  return useMemo(() => {
    const folderPath = `${BASE_PATH}/${LOGO_FOLDER}`;
    const wordmarkName = isChinese ? "LightPagePDFLogoZh" : "StirlingPDFLogo";

    return {
      folderPath,
      getAssetPath: (name: string) => `${folderPath}/${name}`,
      wordmark: {
        black: `${folderPath}/${wordmarkName}BlackText.svg`,
        grey: `${folderPath}/${wordmarkName}GreyText.svg`,
        white: `${folderPath}/${wordmarkName}WhiteText.svg`,
      },
      tooltipLogo: `${folderPath}/logo-tooltip.svg`,
      firstPage: `${folderPath}/Firstpage.png`,
      favicon: `${folderPath}/favicon.ico`,
      logo192: `${folderPath}/logo192.png`,
      logo512: `${folderPath}/logo512.png`,
      manifestHref: `${BASE_PATH}/manifest.json`,
    };
  }, [isChinese]);
}
