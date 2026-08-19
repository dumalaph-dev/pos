/**
 * Signup form state, deliberately kept out of `actions.ts`.
 *
 * A `"use server"` module may only export async functions — anything else
 * throws `A "use server" file can only export async functions, found object`
 * when the module is evaluated, which takes down the whole route. That is a
 * runtime failure at module evaluation, so neither `tsc` nor `next build`
 * catches it; the first sign is a 500 on the live page.
 *
 * The types alone would have been safe (they are erased at compile time), but
 * they live here with the constant so the initial state and its shape stay
 * together.
 */
export type SignupField =
  | "full_name"
  | "organization_name"
  | "store_name"
  | "store_address"
  | "email"
  | "password"
  | "password_confirmation"
  | "referral_code";

export type SignupState = {
  ok: boolean;
  message: string;
  needsConfirmation?: boolean;
  errors?: Partial<Record<SignupField, string>>;
};

export const INITIAL_SIGNUP_STATE: SignupState = { ok: false, message: "" };
