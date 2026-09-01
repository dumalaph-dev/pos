import { cache } from "react";
import { createAdminClient } from "@/lib/employee-auth";
import { isPlatformAdminEmail, platformAdminEmails } from "@/lib/platform-admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  hasPlatformOperatorPermission,
  normalizePlatformOperatorRole,
  type PlatformOperatorPermission,
  type PlatformOperatorRole,
} from "@/lib/platform-operators";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type PlatformOperatorActor = {
  ok: true;
  admin: PlatformAdminClient;
  userId: string;
  email: string | null;
  role: PlatformOperatorRole;
  isBootstrap: boolean;
};

export type PlatformOperatorFailure = {
  ok: false;
  message: string;
  code: "unauthenticated" | "configuration" | "schema" | "forbidden" | "database";
};

export type PlatformOperatorRecord = {
  id: string;
  email: string;
  role: PlatformOperatorRole;
  is_active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  is_bootstrap: boolean;
};

export type PlatformOperatorAuditRecord = {
  id: string;
  operator_id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};

export type PlatformOperatorsResult = {
  records: PlatformOperatorRecord[];
  auditLogs: PlatformOperatorAuditRecord[];
  schemaAvailable: boolean;
};

const OPERATOR_SCHEMA_MESSAGE = "Apply Supabase migration 0077_platform_operators.sql before using platform operator roles.";

/**
 * Resolve the current operator once per server render/request. The env
 * allowlist deliberately remains an owner bootstrap path so a broken or
 * locked operator table cannot strand the platform console.
 */
const resolveCurrentPlatformOperator = cache(async (): Promise<PlatformOperatorActor | PlatformOperatorFailure> => {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, code: "unauthenticated", message: "Your session has expired. Sign in again to open the platform console." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, code: "configuration", message: "The platform database client is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };

  const email = normalizePlatformOperatorEmail(user.email);
  if (isBootstrapPlatformOperatorEmail(email)) {
    return { ok: true, admin, userId: user.id, email, role: "owner", isBootstrap: true };
  }

  if (!email) return { ok: false, code: "forbidden", message: "Platform operator access requires a verified account email." };

  const result = await admin
    .from("platform_operators")
    .select("id, email, role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (result.error) {
    if (isMissingPlatformOperatorSchema(result.error.message)) return { ok: false, code: "schema", message: OPERATOR_SCHEMA_MESSAGE };
    return { ok: false, code: "database", message: "The platform operator record could not be read. Try again or review the operator database." };
  }

  const role = normalizePlatformOperatorRole(result.data?.role);
  if (!result.data || !role) return { ok: false, code: "forbidden", message: "This account is not an active platform operator." };

  return { ok: true, admin, userId: user.id, email, role, isBootstrap: false };
});

export async function requirePlatformOperator(permission: PlatformOperatorPermission): Promise<PlatformOperatorActor | PlatformOperatorFailure> {
  const actor = await resolveCurrentPlatformOperator();
  if (!actor.ok) return actor;
  if (!hasPlatformOperatorPermission(actor.role, permission)) {
    return { ok: false, code: "forbidden", message: `${operatorRoleLabel(actor.role)} operators cannot perform this action.` };
  }
  return actor;
}

export async function readPlatformOperators(admin: PlatformAdminClient): Promise<PlatformOperatorsResult> {
  const result = await admin
    .from("platform_operators")
    .select("id, email, role, is_active, created_by, created_at, updated_by, updated_at, revoked_by, revoked_at")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  const tableRecords: PlatformOperatorRecord[] = (result.data ?? []).flatMap((record) => {
    const email = normalizePlatformOperatorEmail(typeof record.email === "string" ? record.email : null);
    const role = normalizePlatformOperatorRole(record.role);
    if (!email || !role || typeof record.id !== "string") return [];
    const isBootstrap = isBootstrapPlatformOperatorEmail(email);
    return [{
      id: record.id,
      email,
      role: isBootstrap ? "owner" : role,
      is_active: isBootstrap || Boolean(record.is_active),
      created_by: typeof record.created_by === "string" ? record.created_by : null,
      created_at: typeof record.created_at === "string" ? record.created_at : null,
      updated_by: typeof record.updated_by === "string" ? record.updated_by : null,
      updated_at: typeof record.updated_at === "string" ? record.updated_at : null,
      revoked_by: typeof record.revoked_by === "string" ? record.revoked_by : null,
      revoked_at: typeof record.revoked_at === "string" ? record.revoked_at : null,
      is_bootstrap: isBootstrap,
    }];
  });

  const records = [...tableRecords];
  const existingEmails = new Set(tableRecords.map((record) => record.email));
  for (const email of platformAdminEmails()) {
    const normalizedEmail = normalizePlatformOperatorEmail(email);
    if (!normalizedEmail || existingEmails.has(normalizedEmail)) continue;
    records.unshift({
      id: `bootstrap:${normalizedEmail}`,
      email: normalizedEmail,
      role: "owner",
      is_active: true,
      created_by: null,
      created_at: null,
      updated_by: null,
      updated_at: null,
      revoked_by: null,
      revoked_at: null,
      is_bootstrap: true,
    });
  }

  const auditResult = await admin
    .from("platform_operator_audit_logs")
    .select("id, operator_id, action, actor_id, actor_email, before, after, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return {
    records,
    auditLogs: auditResult.error ? [] : (auditResult.data ?? []) as PlatformOperatorAuditRecord[],
    schemaAvailable: !result.error,
  };
}

export function normalizePlatformOperatorEmail(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function platformOperatorSchemaMessage() {
  return OPERATOR_SCHEMA_MESSAGE;
}

export function isBootstrapPlatformOperatorEmail(email: string | null | undefined) {
  return isPlatformAdminEmail(normalizePlatformOperatorEmail(email));
}

function isMissingPlatformOperatorSchema(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("platform_operators") || normalized.includes("platform_operator_audit_logs") || normalized.includes("schema cache") || normalized.includes("relation") || normalized.includes("does not exist");
}

function operatorRoleLabel(role: PlatformOperatorRole) {
  return role === "read_only" ? "Read-only" : role.charAt(0).toUpperCase() + role.slice(1);
}
