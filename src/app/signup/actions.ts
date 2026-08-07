"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import type { SignupField, SignupState } from "./state";

// The form state and its initial value live in `./state` because a
// `"use server"` module may only export async functions. Exporting the
// constant from here threw at module evaluation and 500'd `/signup`.

function readText(formData: FormData, name: SignupField) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readSecret(formData: FormData, name: SignupField) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function signupError(message: string, errors?: SignupState["errors"]): SignupState {
  return { ok: false, message, ...(errors ? { errors } : {}) };
}

function signupConfirmation(): SignupState {
  return {
    ok: true,
    message: "If this email is eligible for a new account, we will send a confirmation link. If you already have an account, use Sign in.",
    needsConfirmation: true,
  };
}

function isDuplicateAuthError(message: string) {
  return /already.*(registered|exists)|user.*already/i.test(message);
}

function publicAuthError(message: string) {
  if (/password/i.test(message)) {
    return "Choose a password with at least 8 characters, including a letter and a number.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (/database error|workspace|profile|trigger/i.test(message)) {
    return "Your account could not finish setting up its POS workspace. Please try again.";
  }
  return "We could not create your account. Check your details and try again.";
}

async function publicSiteOrigin() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) {
    try {
      const parsed = new URL(configuredSiteUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
    } catch {
      // Fall through to the local request host when the setting is invalid.
    }
  }

  // Never derive a production email redirect from the request Host header. A
  // forged host could otherwise influence the confirmation link destination.
  if (process.env.NODE_ENV === "production") return null;

  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"))?.split(",")[0]?.trim();
  if (!host) return null;

  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (protocol !== "http" && protocol !== "https") return null;
  return `${protocol}://${host}`;
}

function confirmationRedirect(origin: string) {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", "/admin?welcome=1");
  return callback.toString();
}

export async function signupStoreOwner(_previousState: SignupState, formData: FormData): Promise<SignupState> {
  if (await getAuthenticatedUser()) redirect("/admin");

  const fullName = readText(formData, "full_name");
  const organizationName = readText(formData, "organization_name");
  const storeName = readText(formData, "store_name");
  const storeAddress = readText(formData, "store_address");
  const email = readText(formData, "email").toLowerCase();
  const password = readSecret(formData, "password");
  const passwordConfirmation = readSecret(formData, "password_confirmation");
  const errors: SignupState["errors"] = {};

  if (fullName.length < 2 || fullName.length > 120) errors.full_name = "Enter your name (2–120 characters).";
  if (organizationName.length < 2 || organizationName.length > 120) errors.organization_name = "Enter a business name (2–120 characters).";
  if (storeName.length < 2 || storeName.length > 120) errors.store_name = "Enter a branch name (2–120 characters).";
  if (storeAddress.length > 240) errors.store_address = "The address must be 240 characters or fewer.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = "Use at least 8 characters with a letter and a number.";
  }
  if (password !== passwordConfirmation) errors.password_confirmation = "Passwords do not match.";

  if (Object.keys(errors).length > 0) return signupError("Please correct the highlighted fields.", errors);

  const supabase = await createClient();
  const origin = await publicSiteOrigin();
  if (!origin) {
    return signupError("Sign-up is not configured for this website yet. Please contact the administrator.");
  }

  const options = {
    data: {
      account_type: "store_owner",
      full_name: fullName,
      organization_name: organizationName,
      store_name: storeName,
      store_address: storeAddress,
    },
    ...(origin ? { emailRedirectTo: confirmationRedirect(origin) } : {}),
  };

  const { data, error } = await supabase.auth.signUp({ email, password, options });
  if (error) return isDuplicateAuthError(error.message) ? signupConfirmation() : signupError(publicAuthError(error.message));
  if (!data.user) return signupError("We could not create your account. Please try again.");
  if (!data.user.identities?.length) return signupConfirmation();

  if (data.session) redirect("/admin?welcome=1");

  return {
    ok: true,
    message: "Your account is ready. Check your email to confirm it, then sign in to open your POS workspace.",
    needsConfirmation: true,
  };
}
