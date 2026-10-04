import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import markUrl from "@app/assets/brand/branding-logo/logo-mark.svg";
import wordmarkLightUrl from "@app/assets/brand/branding-logo/wordmark-light.svg";
import wordmarkDarkUrl from "@app/assets/brand/branding-logo/wordmark-dark.svg";
import wordmarkZhLightUrl from "@app/assets/brand/branding-logo/wordmark-zh-light.svg";
import wordmarkZhDarkUrl from "@app/assets/brand/branding-logo/wordmark-zh-dark.svg";
import "@app/ui/Logo.css";

/** iconOnly = mark; textOnly = wordmark; iconAndText = both. */
export type LogoVariant = "iconOnly" | "iconAndText" | "textOnly";

interface LogoProps {
  variant?: LogoVariant;
  /** Layout for iconAndText: mark left of text, or stacked above it. */
  orientation?: "horizontal" | "vertical";
  /** Height of the mark (CSS length). */
  iconHeight?: string;
  /** Height of the wordmark (CSS length). */
  textHeight?: string;
  /** Gap between mark and wordmark. */
  gap?: string;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}

/**
 * Shared brand lockup used across editor + processor. The mark is theme-
 * agnostic; the wordmark swaps light/dark via CSS so it tracks the active
 * colour scheme in both the editor (data-mantine-color-scheme) and the portal
 * (data-theme).
 */
export function Logo({
  variant = "iconAndText",
  orientation = "horizontal",
  iconHeight = "1.75rem",
  textHeight = "1rem",
  gap = "0.5rem",
  className,
  style,
  alt,
}: LogoProps) {
  const { i18n } = useTranslation();
  const isChinese = (i18n.resolvedLanguage || i18n.language || "").startsWith(
    "zh",
  );
  const label = alt ?? (isChinese ? "轻页 PDF" : "LightPage PDF");
  const showIcon = variant === "iconOnly" || variant === "iconAndText";
  const showText = variant === "textOnly" || variant === "iconAndText";

  const cls = [
    "sui-logo",
    orientation === "vertical" ? "sui-logo--vertical" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Layout set inline so a consumer's className can't restack the lockup.
  const layoutStyle: CSSProperties = {
    display: orientation === "vertical" ? "flex" : "inline-flex",
    flexDirection: orientation === "vertical" ? "column" : "row",
    alignItems: "center",
    gap,
  };

  return (
    <span className={cls} style={{ ...layoutStyle, ...style }}>
      {showIcon && (
        <img
          className="sui-logo__mark"
          src={markUrl}
          alt={showText ? "" : label}
          aria-hidden={showText ? true : undefined}
          style={{ height: iconHeight }}
        />
      )}
      {showText && (
        <>
          <img
            className="sui-logo__wordmark sui-logo__wordmark--light"
            src={isChinese ? wordmarkZhLightUrl : wordmarkLightUrl}
            alt={label}
            style={{ height: textHeight }}
          />
          <img
            className="sui-logo__wordmark sui-logo__wordmark--dark"
            src={isChinese ? wordmarkZhDarkUrl : wordmarkDarkUrl}
            alt={label}
            style={{ height: textHeight }}
          />
        </>
      )}
    </span>
  );
}
