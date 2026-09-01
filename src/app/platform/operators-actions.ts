"use server";

import { revalidatePath } from "next/cache";
import {
  isBootstrapPlatformOperatorEmail,
  normalizePlatformOperatorEmail,
  requirePlatformOperator,
  platformOperatorSchemaMessage,
} from "@/lib/platform-operators-server";
import {
  normalizePlatformOperatorRole,
  platformOperatorRoleLabel,
  type PlatformOperatorRole,
} from "@/lib/platform-operators";
import type { PlatformOperatorActor } from "@/lib/platform-operators-server";

export type OperatorActionState =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function invitePlatformOperator(_previousState: OperatorActionState, formData: FormData): Promise<OperatorActionState> {
  const actor = await requirePlatformOperator("operator_manage");
  if (!actor.ok) return actor;

  const email = normalizePlatformOperatorEmail(readText(formData, "email"));
  const role = normalizePlatformOperatorRole(readText(formData, "role"));
  if (!isValidEmail(email)) return { ok: false, message: "Enter a valid operator email address." };
  if (!role) return { ok: false, message: "Choose a valid platform operator role." };
  if (isBootstrapPlatformOperatorEmail(email)) return { ok: false, message: "Bootstrap owners are managed through PLATFORM_ADMIN_EMAILS and cannot be changed here." };

  const result = await actor.admin.rpc("create_platform_operator", {
    p_email: email,
    p_role: role,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
  });
  if (result.error) return operatorMutationError(result.error.message);

  const record = isRecord(result.data) ? result.data : null;
  const reactivated = record?.reactivated === true;
  revalidateOperatorPages();
  return {
    ok: true,
    message: `${email} ${reactivated ? "reactivated" : "invited"} as a ${platformOperatorRoleLabel(role)} operator.`,
  };
}

export async function changePlatformOperatorRole(_previousState: OperatorActionState, formData: FormData): Promise<OperatorActionState> {
  const actor = await requirePlatformOperator("operator_manage");
  if (!actor.ok) return actor;

  const operatorId = readText(formData, "operator_id");
  const role = normalizePlatformOperatorRole(readText(formData, "role"));
  if (!isUuid(operatorId)) return { ok: false, message: "Choose a valid platform operator." };
  if (!role) return { ok: false, message: "Choose a valid platform operator role." };

  const target = await readOperator(actor.admin, operatorId);
  if (!target.ok) return target;
  if (isBootstrapPlatformOperatorEmail(target.email)) return { ok: false, message: "Bootstrap owners are managed through PLATFORM_ADMIN_EMAILS and cannot be changed here." };

  const result = await actor.admin.rpc("change_platform_operator_role", {
    p_operator_id: operatorId,
    p_role: role,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
  });
  if (result.error) return operatorMutationError(result.error.message);

  revalidateOperatorPages();
  return { ok: true, message: `${target.email} is now a ${platformOperatorRoleLabel(role)} operator.` };
}

export async function revokePlatformOperator(_previousState: OperatorActionState, formData: FormData): Promise<OperatorActionState> {
  const actor = await requirePlatformOperator("operator_manage");
  if (!actor.ok) return actor;

  const operatorId = readText(formData, "operator_id");
  if (!isUuid(operatorId)) return { ok: false, message: "Choose a valid platform operator." };

  const target = await readOperator(actor.admin, operatorId);
  if (!target.ok) return target;
  if (isBootstrapPlatformOperatorEmail(target.email)) return { ok: false, message: "Bootstrap owners are managed through PLATFORM_ADMIN_EMAILS and cannot be revoked here." };

  const result = await actor.admin.rpc("revoke_platform_operator", {
    p_operator_id: operatorId,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
  });
  if (result.error) return operatorMutationError(result.error.message);

  revalidateOperatorPages();
  return { ok: true, message: `${target.email} has been revoked. Re-invite the address if access is needed again.` };
}

async function readOperator(admin: PlatformOperatorActor["admin"], operatorId: string): Promise<{ ok: true; email: string; role: PlatformOperatorRole; isActive: boolean } | { ok: false; message: string }> {
  if (!admin) return { ok: false, message: "The platform database client is not configured." };
  const result = await admin.from("platform_operators").select("email, role, is_active").eq("id", operatorId).maybeSingle();
  if (result.error) return operatorMutationError(result.error.message);
  const email = normalizePlatformOperatorEmail(typeof result.data?.email === "string" ? result.data.email : null);
  const role = normalizePlatformOperatorRole(result.data?.role);
  if (!result.data || !email || !role) return { ok: false, message: "That platform operator could not be found. Refresh the page and try again." };
  return { ok: true, email, role, isActive: Boolean(result.data.is_active) };
}

function revalidateOperatorPages() {
  revalidatePath("/platform");
  revalidatePath("/platform/operators");
  revalidatePath("/platform/operations");
}

function operatorMutationError(detail: string): { ok: false; message: string } {
  const normalized = detail.toLowerCase();
  if (normalized.includes("platform_operators") || normalized.includes("platform_operator_audit_logs") || normalized.includes("schema cache") || normalized.includes("relation") || normalized.includes("does not exist")) {
    return { ok: false, message: platformOperatorSchemaMessage() };
  }
  if (normalized.includes("platform_operator_already_active")) return { ok: false, message: "That email is already an active platform operator." };
  if (normalized.includes("platform_operator_invalid_email")) return { ok: false, message: "Enter a valid operator email address." };
  if (normalized.includes("platform_operator_invalid_role")) return { ok: false, message: "Choose a valid platform operator role." };
  if (normalized.includes("platform_operator_not_found")) return { ok: false, message: "That platform operator could not be found. Refresh the page and try again." };
  if (normalized.includes("platform_operator_not_active")) return { ok: false, message: "That platform operator is already revoked." };
  if (normalized.includes("platform_operator_same_role")) return { ok: false, message: "That operator already has this role." };
  if (normalized.includes("platform_operator_last_owner")) return { ok: false, message: "Keep at least one active owner operator before changing or revoking this owner." };
  return { ok: false, message: detail || "The platform operator change could not be completed." };
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return value.length >= 3 && value.length <= 320 && /^\S+@\S+\.\S+$/.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
