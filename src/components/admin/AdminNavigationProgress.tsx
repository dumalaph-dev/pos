"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { beginAdminInteraction, completeAdminInteraction, type AdminPerformanceSurface } from "@/lib/admin/performance";

export function AdminNavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  return <NavigationProgressBar routeKey={routeKey} />;
}

function routeSurface(pathname: string): AdminPerformanceSurface {
  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/sales")) return "sales";
  if (pathname.startsWith("/admin/shifts")) return "shifts";
  if (pathname.startsWith("/admin/inventory/variance")) return "variance";
  if (pathname.startsWith("/admin/inventory")) return "inventory";
  if (pathname.startsWith("/admin/promotions")) return "promotions";
  if (pathname.startsWith("/admin/audit")) return "audit";
  if (pathname === "/admin" || pathname === "/admin/") return "dashboard";
  return "admin";
}

function NavigationProgressBar({ routeKey }: { routeKey: string }) {
  const [pending, setPending] = useState(false);
  const navigationTokenRef = useRef<ReturnType<typeof beginAdminInteraction>>(null);

  useEffect(() => {
    const token = navigationTokenRef.current;
    if (!token) return;
    navigationTokenRef.current = null;
    setPending(false);
    completeAdminInteraction(token, {
      route_changed: true,
      request_started: true,
      record_cached: false,
    });
  }, [routeKey]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.hasAttribute("download") || target.target === "_blank") return;
      if (target.closest("[data-admin-local-trigger], [data-order-trigger], [data-shift-trigger]")) return;

      const nextUrl = new URL(target.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.origin !== currentUrl.origin || (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search)) return;

      navigationTokenRef.current = beginAdminInteraction(routeSurface(nextUrl.pathname), "navigation");
      setPending(true);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timeout = window.setTimeout(() => {
      const token = navigationTokenRef.current;
      navigationTokenRef.current = null;
      setPending(false);
      completeAdminInteraction(token, {
        route_changed: false,
        request_started: true,
        record_cached: false,
        error: true,
      });
    }, 10000);
    return () => window.clearTimeout(timeout);
  }, [pending]);

  return (
    <div className={`admin-navigation-progress ${pending ? "is-pending" : ""}`} aria-hidden="true">
      <span />
    </div>
  );
}
