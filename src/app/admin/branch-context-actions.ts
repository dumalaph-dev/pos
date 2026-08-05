"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_ALL_BRANCHES, ADMIN_BRANCH_COOKIE } from "@/lib/admin/branch-context";

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function safeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/admin";
}

export async function selectAdminBranch(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") redirect("/admin");

  const storeId = readText(formData, "store_id");
  const returnPath = safeReturnPath(readText(formData, "return_to"));
  const cookieStore = await cookies();

  if (!storeId) {
    cookieStore.set(ADMIN_BRANCH_COOKIE, ADMIN_ALL_BRANCHES, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    redirect(returnPath);
  }

  const { data: branch } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("org_id", profile.org_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!branch) {
    cookieStore.set(ADMIN_BRANCH_COOKIE, ADMIN_ALL_BRANCHES, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    redirect(returnPath);
  }

  cookieStore.set(ADMIN_BRANCH_COOKIE, storeId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect(returnPath);
}
