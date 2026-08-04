"use server";

import { redirect } from "next/navigation";
import { invalidateAdminProfile } from "@/lib/admin/profile";
import { createAdminClient } from "@/lib/employee-auth";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { message: string };

type PasswordProfile = {
  org_id: string;
  store_id: string | null;
  role: "admin" | "manager" | "cashier";
  password_change_required: boolean;
};

function destinationFor(role: PasswordProfile["role"]) {
  return role === "cashier" ? "/pos" : "/admin";
}
export async function changePassword(_previousState: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  if (password.length < 8) return { message: "Your new password must be at least 8 characters." };
  if (password !== confirmation) return { message: "The passwords do not match." };

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/");

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("org_id, store_id, role, password_change_required")
    .eq("id", userData.user.id)
    .single();
  const profile = profileData as PasswordProfile | null;
  if (profileError || !profile) redirect("/");
  if (!profile.password_change_required) redirect(destinationFor(profile.role));

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) return { message: passwordError.message || "Your password could not be updated." };

  const admin = createAdminClient();
  if (!admin) {
    return { message: "Your password changed, but the employee access flag could not be cleared. Ask an administrator to finish the setup." };
  }

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({ password_change_required: false })
    .eq("id", userData.user.id)
    .eq("org_id", profile.org_id);
  if (profileUpdateError) return { message: "Your password changed, but the first-login step could not be completed. Please try again." };

  // The admin layout gates first-login users on the cached profile; drop it so
  // the redirect below is not bounced straight back to this page.
  invalidateAdminProfile(userData.user.id);

  await supabase.from("audit_logs").insert({
    org_id: profile.org_id,
    store_id: profile.store_id,
    actor_id: userData.user.id,
    action: "auth.password.changed",
    entity: "profiles",
    entity_id: userData.user.id,
    before: { password_change_required: true },
    after: { password_change_required: false },
  });

  redirect(destinationFor(profile.role));
}
