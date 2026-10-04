import { BrandMark } from "@app/components/shared/BrandMark";

export function StirlingLogoAnimated({ size = 20 }: { size?: number }) {
  return <BrandMark height={`${size}px`} className="sui-brandmark--working" />;
}
