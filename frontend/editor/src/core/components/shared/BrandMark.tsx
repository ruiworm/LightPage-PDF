import markUrl from "@app/assets/brand/branding-logo/logo-mark.svg";
import { Icon } from "@app/ui/Icon";
import "@app/components/shared/BrandMark.css";

interface BrandMarkProps {
  /** Height of the mark (CSS length). */
  height?: string;
  className?: string;
}

/**
 * Shared brand mark. Menu triggers marked `data-brandmark-morph` reveal a
 * chevron on hover, keyboard focus, or while the menu is open.
 */
export function BrandMark({ height = "1.6rem", className }: BrandMarkProps) {
  return (
    <span
      className={`sui-brandmark${className ? ` ${className}` : ""}`}
      style={{ height, width: height }}
      role="img"
      aria-label="LightPage PDF"
    >
      <img className="sui-brandmark__logo" src={markUrl} alt="" aria-hidden />
      <Icon
        name="chevron-down"
        className="sui-brandmark__chevron"
        size="100%"
      />
    </span>
  );
}
