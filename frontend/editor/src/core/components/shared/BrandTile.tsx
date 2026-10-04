interface BrandTileProps {
  /** CSS length. Omit to let the caller's CSS size it. */
  size?: string;
  className?: string;
}

/** The mark in a rounded square. Decorative: call sites carry the accessible name. */
export function BrandTile({ size, className }: BrandTileProps) {
  return (
    <img
      className={className}
      src={markUrl}
      alt=""
      style={size ? { width: size, height: size } : undefined}
      aria-hidden
    />
  );
}
import markUrl from "@app/assets/brand/branding-logo/logo-mark.svg";
