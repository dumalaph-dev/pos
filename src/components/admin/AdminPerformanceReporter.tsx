"use client";

import { useEffect } from "react";
import type { AdminPerformanceDetail, AdminPerformanceSurface } from "@/lib/admin/performance";

type PerformancePayload = Pick<
  AdminPerformanceDetail,
  | "surface"
  | "interaction"
  | "mode"
  | "duration_ms"
  | "route_changed"
  | "request_started"
  | "record_cached"
  | "error"
  | "resource_count"
  | "resource_transfer_bytes"
  | "resource_encoded_body_bytes"
> & {
  sample_type: "initial_document" | "soft_navigation";
  navigation_transfer_bytes: number;
  navigation_encoded_body_bytes: number;
};

type ResourceTotals = {
  count: number;
  transferBytes: number;
  encodedBodyBytes: number;
};

function resourceTotals(): ResourceTotals {
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  return entries.reduce<ResourceTotals>((totals, entry) => ({
    count: totals.count + 1,
    transferBytes: totals.transferBytes + (Number.isFinite(entry.transferSize) ? entry.transferSize : 0),
    encodedBodyBytes: totals.encodedBodyBytes + (Number.isFinite(entry.encodedBodySize) ? entry.encodedBodySize : 0),
  }), { count: 0, transferBytes: 0, encodedBodyBytes: 0 });
}

function routeSurface(pathname: string): AdminPerformanceSurface {
  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/sales")) return "sales";
  if (pathname.startsWith("/admin/shifts")) return "shifts";
  if (pathname.startsWith("/admin/inventory/variance")) return "variance";
  if (pathname.startsWith("/admin/inventory")) return "inventory";
  if (pathname.startsWith("/admin/promotions")) return "promotions";
  if (pathname.startsWith("/admin/audit")) return "audit";
  if (pathname.startsWith("/admin/customers")) return "customers";
  if (pathname.startsWith("/admin/suppliers")) return "suppliers";
  if (pathname.startsWith("/admin/expenses")) return "expenses";
  if (pathname.startsWith("/admin/branches")) return "branches";
  if (pathname.startsWith("/admin/employees")) return "employees";
  if (pathname === "/products" || pathname.startsWith("/products/")) return "products";
  if (pathname === "/admin" || pathname === "/admin/") return "dashboard";
  return "admin";
}

/**
 * Sends only aggregate soft-navigation timing and byte counts to the server
 * logs. Local modal opens intentionally have request_started=false, so they
 * never create a telemetry request or undermine the local-first path.
 */
export function AdminPerformanceReporter() {
  useEffect(() => {
    const post = (payload: PerformancePayload) => {
      const body = JSON.stringify(payload);

      try {
        if (typeof navigator.sendBeacon === "function") {
          const accepted = navigator.sendBeacon(
            "/api/admin/performance",
            new Blob([body], { type: "application/json" }),
          );
          if (accepted) return;
        }

        void fetch("/api/admin/performance", {
          method: "POST",
          body,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // Telemetry must never surface an error or affect navigation.
      }
    };

    const report = (event: Event) => {
      const detail = (event as CustomEvent<AdminPerformanceDetail>).detail;
      if (!detail || !detail.request_started || detail.mode !== "online") return;

      const payload: PerformancePayload = {
        surface: detail.surface,
        interaction: detail.interaction,
        mode: detail.mode,
        duration_ms: detail.duration_ms,
        route_changed: detail.route_changed,
        request_started: detail.request_started,
        record_cached: detail.record_cached,
        error: detail.error,
        resource_count: detail.resource_count,
        resource_transfer_bytes: detail.resource_transfer_bytes,
        resource_encoded_body_bytes: detail.resource_encoded_body_bytes,
        sample_type: "soft_navigation",
        navigation_transfer_bytes: 0,
        navigation_encoded_body_bytes: 0,
      };
      post(payload);
    };

    let initialReported = false;
    const reportInitialNavigation = () => {
      if (initialReported || !navigator.onLine) return;
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (!navigation) return;

      initialReported = true;
      const resources = resourceTotals();
      post({
        surface: routeSurface(window.location.pathname),
        interaction: "navigation",
        mode: "online",
        duration_ms: Math.min(120_000, Math.max(0, Math.round(navigation.loadEventEnd || navigation.domContentLoadedEventEnd || navigation.duration))),
        route_changed: true,
        request_started: true,
        record_cached: false,
        error: false,
        resource_count: resources.count,
        resource_transfer_bytes: Math.round(resources.transferBytes),
        resource_encoded_body_bytes: Math.round(resources.encodedBodyBytes),
        sample_type: "initial_document",
        navigation_transfer_bytes: Number.isFinite(navigation.transferSize) ? Math.round(navigation.transferSize) : 0,
        navigation_encoded_body_bytes: Number.isFinite(navigation.encodedBodySize) ? Math.round(navigation.encodedBodySize) : 0,
      });
    };

    if (document.readyState === "complete") {
      const timeout = window.setTimeout(reportInitialNavigation, 0);
      window.addEventListener("dumala:admin-performance", report);
      return () => {
        window.clearTimeout(timeout);
        window.removeEventListener("dumala:admin-performance", report);
      };
    }

    window.addEventListener("dumala:admin-performance", report);
    window.addEventListener("load", reportInitialNavigation, { once: true });
    const timeout = window.setTimeout(reportInitialNavigation, 5000);
    return () => {
      window.removeEventListener("dumala:admin-performance", report);
      window.removeEventListener("load", reportInitialNavigation);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
