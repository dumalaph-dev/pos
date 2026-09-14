import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLegalConfiguration,
  getLegalConfigurationIssues,
  isLegalConfigurationComplete,
  isLegalPlaceholder,
  REQUIRED_LEGAL_ENV_KEYS,
  type LegalEnvironment,
} from "../src/lib/legal-config.ts";

const COMPLETE_LEGAL_ENV: LegalEnvironment = {
  NEXT_PUBLIC_LEGAL_ENTITY_NAME: "Dumala Software Development Services",
  NEXT_PUBLIC_LEGAL_BUSINESS_REGISTRATION: "DTI Business Name No. 8335466",
  NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS: "San Carlos City, Negros Occidental, Philippines",
  NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL: "support@example.invalid",
  NEXT_PUBLIC_LEGAL_SUPPORT_PHONE: "+639155555555",
  NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL: "privacy@example.invalid",
  NEXT_PUBLIC_LEGAL_DPO_CONTACT: "Privacy Contact",
  NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE: "2026-09-14",
  NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION: "legal-2026-09-14",
};

test("the legal validator covers every required public legal variable", () => {
  assert.equal(REQUIRED_LEGAL_ENV_KEYS.length, 9);
  assert.equal(isLegalConfigurationComplete(COMPLETE_LEGAL_ENV), true);
  assert.deepEqual(getLegalConfigurationIssues(COMPLETE_LEGAL_ENV), []);
  assert.doesNotThrow(() => assertLegalConfiguration(COMPLETE_LEGAL_ENV));
});

test("missing and draft legal values are rejected without rejecting final values", () => {
  const invalidEnvironment: LegalEnvironment = {
    ...COMPLETE_LEGAL_ENV,
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: "",
    NEXT_PUBLIC_LEGAL_BUSINESS_REGISTRATION: "[BUSINESS REGISTRATION — COMPLETE BEFORE PUBLISHING]",
    NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE: "Not yet effective — local review",
    NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION: "review-2026-09-14",
  };

  assert.deepEqual(getLegalConfigurationIssues(invalidEnvironment), [
    "NEXT_PUBLIC_LEGAL_ENTITY_NAME",
    "NEXT_PUBLIC_LEGAL_BUSINESS_REGISTRATION",
    "NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE",
    "NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION",
  ]);
  assert.equal(isLegalPlaceholder("[LEGAL ENTITY NAME — COMPLETE BEFORE PUBLISHING]"), true);
  assert.equal(isLegalPlaceholder("draft-2026-09-14"), true);
  assert.equal(isLegalPlaceholder("Dumala Software Development Services"), false);
  assert.throws(
    () => assertLegalConfiguration(invalidEnvironment),
    /NEXT_PUBLIC_LEGAL_ENTITY_NAME.*NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION/,
  );
});
