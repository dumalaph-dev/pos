import { stockThreshold } from "@/lib/inventory";

export const DEFAULT_ADMIN_INVENTORY_SETTINGS = {
  lowStockAlertsEnabled: true,
  defaultLowStockThreshold: 2,
};

export type AdminInventorySettings = {
  lowStockAlertsEnabled: boolean;
  defaultLowStockThreshold: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readThreshold(value: unknown) {
  const threshold = Number(value);
  return Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_ADMIN_INVENTORY_SETTINGS.defaultLowStockThreshold;
}

export function readAdminInventorySettings(settings: unknown): AdminInventorySettings {
  const dashboard = asRecord(asRecord(settings).admin_dashboard);
  return {
    lowStockAlertsEnabled: dashboard.low_stock_alerts_enabled !== false,
    defaultLowStockThreshold: readThreshold(dashboard.default_low_stock_threshold),
  };
}

export function mergeAdminInventorySettings(settings: unknown, inventorySettings: AdminInventorySettings) {
  const existing = asRecord(settings);
  const existingDashboard = asRecord(existing.admin_dashboard);

  return {
    ...existing,
    admin_dashboard: {
      ...existingDashboard,
      low_stock_alerts_enabled: inventorySettings.lowStockAlertsEnabled,
      default_low_stock_threshold: inventorySettings.defaultLowStockThreshold,
    },
  };
}

/**
 * Keep the dashboard alert setting useful even though the catalog currently
 * stores a default minimum of 2 on every product. Product-specific minimums
 * can raise the shared floor, while the organization setting can raise it for
 * the whole dashboard in one place.
 */
export function dashboardLowStockThreshold(minStock: number | string | null | undefined, defaultThreshold: number) {
  return Math.max(defaultThreshold, stockThreshold(minStock, defaultThreshold));
}
