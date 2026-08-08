export const DEFAULT_ADMIN_DISCOUNT_SETTINGS = {
  adminPinThresholdPercent: 10,
};

export type AdminDiscountSettings = {
  adminPinThresholdPercent: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readPercent(value: unknown) {
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? percent
    : DEFAULT_ADMIN_DISCOUNT_SETTINGS.adminPinThresholdPercent;
}

export function readAdminDiscountSettings(settings: unknown): AdminDiscountSettings {
  const policy = asRecord(asRecord(settings).discount_policy);
  return {
    adminPinThresholdPercent: readPercent(policy.admin_pin_threshold_percent),
  };
}

export function mergeAdminDiscountSettings(settings: unknown, discountSettings: AdminDiscountSettings) {
  const existing = asRecord(settings);
  const existingPolicy = asRecord(existing.discount_policy);

  return {
    ...existing,
    discount_policy: {
      ...existingPolicy,
      admin_pin_threshold_percent: discountSettings.adminPinThresholdPercent,
    },
  };
}
