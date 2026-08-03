import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordChangeForm } from "./PasswordChangeForm";

type PasswordProfile = {
  full_name: string | null;
  role: "admin" | "manager" | "cashier";
  password_change_required: boolean;
};

export default async function PasswordPage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/");

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, password_change_required")
    .eq("id", userData.user.id)
    .single();
  const profile = profileData as PasswordProfile | null;
  if (profileError || !profile) redirect("/");
  if (!profile.password_change_required) redirect(profile.role === "cashier" ? "/pos" : "/admin");

  return <main className="min-h-full flex items-center justify-center bg-bg p-6"><PasswordChangeForm displayName={profile.full_name || "team member"} /></main>;
}
