import { isPublicMenuHostname } from "@/lib/public-menu-domain";

/**
 * Public customer menus intentionally stay separate from the POS app shell.
 * Keep install prompts, offline admin messaging, and service-worker updates
 * out of this route so a QR scan opens a focused ordering experience.
 */
export function isPublicMenuPath(pathname: string, hostname = ""): boolean {
  return pathname === "/menu" || pathname.startsWith("/menu/") || (pathname === "/" && isPublicMenuHostname(hostname));
}
