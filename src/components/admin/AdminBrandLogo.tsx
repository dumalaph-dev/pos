"use client";

import { AdminIcon, type AdminIconName } from "./AdminIcon";

type AdminBrandLogoProps = {
  logoUrl?: string | null;
  className: string;
  iconSize?: number;
  label?: string;
  fallbackIcon?: AdminIconName;
};

export function AdminBrandLogo({
  logoUrl,
  className,
  iconSize = 20,
  label = "Brand logo",
  fallbackIcon = "pig",
}: AdminBrandLogoProps) {
  const imageUrl = logoUrl?.trim() || null;

  return (
    <span
      className={className}
      role={imageUrl ? "img" : undefined}
      aria-label={imageUrl ? label : undefined}
      style={imageUrl ? {
        backgroundImage: `url(${JSON.stringify(imageUrl)})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "contain",
      } : undefined}
    >
      {!imageUrl && <AdminIcon name={fallbackIcon} size={iconSize} />}
    </span>
  );
}
