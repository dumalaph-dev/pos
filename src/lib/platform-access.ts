export type ComplimentaryGrantSource = "manual" | "support" | "campaign" | "referral";
export type ComplimentaryGrantStatus = "active" | "revoked";

export type ComplimentaryAccessGrant = {
  id: string;
  org_id: string;
  source: ComplimentaryGrantSource;
  status: ComplimentaryGrantStatus;
  starts_at: string;
  ends_at: string;
  reason: string;
  created_by: string | null;
  created_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  metadata: Record<string, unknown>;
};

export type EffectiveComplimentaryAccess = {
  grantId: string;
  until: string;
  source: ComplimentaryGrantSource;
  reason: string;
};

export function readEffectiveComplimentaryAccess(
  grants: ComplimentaryAccessGrant[],
  now = Date.now(),
): EffectiveComplimentaryAccess | null {
  const current = grants
    .filter((grant) => {
      const startsAt = Date.parse(grant.starts_at);
      const endsAt = Date.parse(grant.ends_at);
      return grant.status === "active"
        && Number.isFinite(startsAt)
        && Number.isFinite(endsAt)
        && startsAt <= now
        && endsAt > now;
    })
    .sort((left, right) => Date.parse(right.ends_at) - Date.parse(left.ends_at))[0];

  if (!current) return null;
  return {
    grantId: current.id,
    until: current.ends_at,
    source: current.source,
    reason: current.reason,
  };
}

export function isComplimentaryAccessCurrent(value: string | null | undefined, now = Date.now()) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

export function normalizeComplimentaryGrant(value: Partial<ComplimentaryAccessGrant> & Record<string, unknown>): ComplimentaryAccessGrant {
  return {
    id: typeof value.id === "string" ? value.id : "",
    org_id: typeof value.org_id === "string" ? value.org_id : "",
    source: value.source === "support" || value.source === "campaign" || value.source === "referral" ? value.source : "manual",
    status: value.status === "revoked" ? "revoked" : "active",
    starts_at: typeof value.starts_at === "string" ? value.starts_at : new Date(0).toISOString(),
    ends_at: typeof value.ends_at === "string" ? value.ends_at : new Date(0).toISOString(),
    reason: typeof value.reason === "string" ? value.reason : "",
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString(),
    revoked_by: typeof value.revoked_by === "string" ? value.revoked_by : null,
    revoked_at: typeof value.revoked_at === "string" ? value.revoked_at : null,
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
