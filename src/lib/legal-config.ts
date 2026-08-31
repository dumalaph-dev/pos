/**
 * Public legal configuration.
 *
 * These values deliberately have loud fallbacks. A public-facing merchant is
 * expected to publish its real legal identity and contact details; silently
 * substituting a brand name here would make an incomplete launch look ready.
 * Complete the NEXT_PUBLIC_LEGAL_* values in the deployment environment
 * before publishing these documents as final.
 */

const requiredValue = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const legalContact = {
  tradeName: "Dumala POS",
  legalEntityName: requiredValue(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME, "[LEGAL ENTITY NAME — COMPLETE BEFORE PUBLISHING]"),
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

const isConfigured = (value: string) => !value.startsWith("[");

export function isLegalConfigurationComplete() {
  return [
    legalContact.legalEntityName,
    legalContact.businessAddress,
    legalContact.supportEmail,
    legalContact.supportPhone,
    legalContact.privacyEmail,
    legalContact.dpoContact,
    legalContact.effectiveDate,
  ].every(isConfigured);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isPhone(value: string) {
  return /^[+()\d][+()\d\s.-]{5,}$/.test(value);
}
