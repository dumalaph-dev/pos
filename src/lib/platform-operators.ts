export const PLATFORM_OPERATOR_ROLES = ["owner", "billing", "support", "read_only"] as const;

export type PlatformOperatorRole = (typeof PLATFORM_OPERATOR_ROLES)[number];

export type PlatformOperatorPermission =
  | "console_read"
  | "billing_manage"
  | "policy_manage"
  | "support_manage"
  | "entitlement_manage"
  | "operator_manage";

export const PLATFORM_OPERATOR_ROLE_LABELS: Record<PlatformOperatorRole, string> = {
  owner: "Owner",
  billing: "Billing",
  support: "Support",
  read_only: "Read-only",
};

export const PLATFORM_OPERATOR_ROLE_DESCRIPTIONS: Record<PlatformOperatorRole, string> = {
  owner: "All platform controls, including operator management.",
  billing: "Plans, promotions, and entitlement changes; no support controls.",
  support: "Support and account lifecycle controls; entitlement is read-only, with no pricing or policy changes.",
  read_only: "Console visibility without mutation rights.",
};

const ROLE_PERMISSIONS: Record<PlatformOperatorRole, readonly PlatformOperatorPermission[]> = {
  owner: [
    "console_read",
    "billing_manage",
    "policy_manage",
    "support_manage",
    "entitlement_manage",
    "operator_manage",
  ],
  billing: ["console_read", "billing_manage", "entitlement_manage"],
  support: ["console_read", "support_manage"],
  read_only: ["console_read"],
};

export function hasPlatformOperatorPermission(role: PlatformOperatorRole, permission: PlatformOperatorPermission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function normalizePlatformOperatorRole(value: unknown): PlatformOperatorRole | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return PLATFORM_OPERATOR_ROLES.includes(normalized as PlatformOperatorRole)
    ? normalized as PlatformOperatorRole
    : null;
}

export function platformOperatorRoleLabel(role: PlatformOperatorRole) {
  return PLATFORM_OPERATOR_ROLE_LABELS[role];
}
