/**
 * Public legal configuration.
 *
 * These values deliberately have loud fallbacks. A public-facing merchant is
 * expected to publish its real legal identity and contact details; silently
 * substituting a brand name here would make an incomplete launch look ready.
 * Complete the NEXT_PUBLIC_LEGAL_* values in the deployment environment
 * before publishing these documents as final. The fallbacks keep local
 * development usable; the production-only assertion below rejects them.
 */

export const REQUIRED_LEGAL_ENV_KEYS = [
  "NEXT_PUBLIC_LEGAL_ENTITY_NAME",
  "NEXT_PUBLIC_LEGAL_BUSINESS_REGISTRATION",
  "NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS",
  "NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL",
  "NEXT_PUBLIC_LEGAL_SUPPORT_PHONE",
  "NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL",
  "NEXT_PUBLIC_LEGAL_DPO_CONTACT",
  "NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE",
  "NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION",
] as const;

export type LegalEnvironment = Partial<Record<(typeof REQUIRED_LEGAL_ENV_KEYS)[number], string | undefined>>;

const legalEnvironment: LegalEnvironment = {
  NEXT_PUBLIC_LEGAL_ENTITY_NAME: process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME,
  NEXT_PUBLIC_LEGAL_BUSINESS_REGISTRATION: process.env.NEXT_PUBLIC_LEGAL_BUSINESS_REGISTRATION,
  NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS: process.env.NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS,
  NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL,
  NEXT_PUBLIC_LEGAL_SUPPORT_PHONE: process.env.NEXT_PUBLIC_LEGAL_SUPPORT_PHONE,
  NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL: process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL,
  NEXT_PUBLIC_LEGAL_DPO_CONTACT: process.env.NEXT_PUBLIC_LEGAL_DPO_CONTACT,
  NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE: process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE,
  NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION: process.env.NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION,
};

const requiredValue = (value: string | undefined, fallback: string) => value?.trim() || fallback;

const LEGAL_PLACEHOLDER_PATTERNS = [
  /^\[[\s\S]*\]$/i,
  /\b(?:complete before publishing|not yet effective|local review|replace every|replace this|fill in)\b/i,
  /^(?:draft|review|todo|tbd|tba|n\/a|na|placeholder|example|sample|changeme|your)(?:[\s_.:-]|$)/i,
] as const;

export const legalContact = {
  tradeName: "Dumala POS",
  legalEntityName: requiredValue(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME, "[LEGAL ENTITY NAME — COMPLETE BEFORE PUBLISHING]"),
  businessRegistration: requiredValue(process.env.NEXT_PUBLIC_LEGAL_BUSINESS_REGISTRATION, "[BUSINESS REGISTRATION — COMPLETE BEFORE PUBLISHING]"),
  businessAddress: requiredValue(process.env.NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS, "[PHYSICAL BUSINESS ADDRESS — COMPLETE BEFORE PUBLISHING]"),
  supportEmail: requiredValue(process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL, "[SUPPORT EMAIL — COMPLETE BEFORE PUBLISHING]"),
  supportPhone: requiredValue(process.env.NEXT_PUBLIC_LEGAL_SUPPORT_PHONE, "[SUPPORT PHONE — COMPLETE BEFORE PUBLISHING]"),
  privacyEmail: requiredValue(process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL, "[PRIVACY/DPO EMAIL — COMPLETE BEFORE PUBLISHING]"),
  dpoContact: requiredValue(process.env.NEXT_PUBLIC_LEGAL_DPO_CONTACT, "[DPO OR PRIVACY CONTACT — COMPLETE BEFORE PUBLISHING]"),
  effectiveDate: requiredValue(process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE, "[EFFECTIVE DATE — COMPLETE BEFORE PUBLISHING]"),
} as const;

export const LEGAL_DOCUMENT_VERSION = requiredValue(
  process.env.NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION,
  "draft-2026-08-30",
);

export const legalDocumentLinks = [
  { href: "/legal/privacy", label: "Privacy notice" },
  { href: "/legal/terms", label: "Terms of service" },
  { href: "/legal/online-ordering", label: "Online ordering terms" },
  { href: "/legal/billing", label: "Billing and refunds" },
  { href: "/legal/cookies", label: "Cookies and offline storage" },
  { href: "/legal/complaints", label: "Complaints and support" },
] as const;

export function isLegalPlaceholder(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return !normalized || LEGAL_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function getLegalConfigurationIssues(environment: LegalEnvironment = legalEnvironment) {
  return REQUIRED_LEGAL_ENV_KEYS.filter((key) => {
    const value = environment[key]?.trim() ?? "";
    return isLegalPlaceholder(value);
  });
}

export function isLegalConfigurationComplete(environment: LegalEnvironment = legalEnvironment) {
  return getLegalConfigurationIssues(environment).length === 0;
}

export function assertLegalConfiguration(environment: LegalEnvironment = legalEnvironment) {
  const issues = getLegalConfigurationIssues(environment);
  if (issues.length === 0) return;

  throw new Error(
    `Legal configuration is incomplete for production. Set real values for the required NEXT_PUBLIC_LEGAL_* variables: ${issues.join(", ")}. Missing values and draft/placeholders are not allowed.`,
  );
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isPhone(value: string) {
  return /^[+()\d][+()\d\s.-]{5,}$/.test(value);
}

if (process.env.NODE_ENV === "production") {
  assertLegalConfiguration();
}
