import { NextResponse } from "next/server";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

const MAX_BODY_LENGTH = 8_192;
const surfaces = new Set(["dashboard", "sales", "orders", "shifts", "inventory", "promotions", "variance", "audit", "customers", "suppliers", "expenses", "branches", "employees", "products", "admin"]);
const interactions = new Set(["open", "close", "back", "navigation"]);
const modes = new Set(["online", "offline"]);
const sampleTypes = new Set(["initial_document", "soft_navigation"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnum(value: unknown, allowed: Set<string>) {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readBoundedNumber(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum ? Math.round(value) : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_LENGTH) return new NextResponse(null, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!isRecord(parsed) || parsed.request_started !== true) return new NextResponse(null, { status: 204 });

  const surface = readEnum(parsed.surface, surfaces);
  const interaction = readEnum(parsed.interaction, interactions);
  const mode = readEnum(parsed.mode, modes);
  const sampleType = readEnum(parsed.sample_type, sampleTypes);
  const durationMs = readBoundedNumber(parsed.duration_ms, 120_000);
  const resourceCount = readBoundedNumber(parsed.resource_count, 500);
  const transferBytes = readBoundedNumber(parsed.resource_transfer_bytes, 100_000_000);
  const encodedBodyBytes = readBoundedNumber(parsed.resource_encoded_body_bytes, 100_000_000);
  const navigationTransferBytes = readBoundedNumber(parsed.navigation_transfer_bytes ?? 0, 100_000_000);
  const navigationEncodedBodyBytes = readBoundedNumber(parsed.navigation_encoded_body_bytes ?? 0, 100_000_000);
  const routeChanged = readBoolean(parsed.route_changed);
  const recordCached = readBoolean(parsed.record_cached);
  const error = readBoolean(parsed.error);

  if (!surface || !interaction || !mode || !sampleType || durationMs === null || resourceCount === null || transferBytes === null || encodedBodyBytes === null || navigationTransferBytes === null || navigationEncodedBodyBytes === null || routeChanged === null || recordCached === null || error === null) {
    return new NextResponse(null, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const organizationId = typeof profile?.org_id === "string" ? profile.org_id : null;
  const { error: persistError } = await supabase.from("admin_performance_samples").insert({
    org_id: organizationId,
    surface,
    interaction,
    mode,
    sample_type: sampleType,
    request_started: true,
    duration_ms: durationMs,
    route_changed: routeChanged,
    record_cached: recordCached,
    error,
    resource_count: resourceCount,
    resource_transfer_bytes: transferBytes,
    resource_encoded_body_bytes: encodedBodyBytes,
    navigation_transfer_bytes: navigationTransferBytes,
    navigation_encoded_body_bytes: navigationEncodedBodyBytes,
  });

  // Structured deployment logs are the storage boundary for this first slice.
  // No URL, record ID, user ID, organization ID, or request body is logged.
  console.info(JSON.stringify({
    event: "dumala_admin_performance",
    surface,
    interaction,
    mode,
    sample_type: sampleType,
    request_started: true,
    duration_ms: durationMs,
    route_changed: routeChanged,
    record_cached: recordCached,
    error,
    resource_count: resourceCount,
    resource_transfer_bytes: transferBytes,
    resource_encoded_body_bytes: encodedBodyBytes,
    navigation_transfer_bytes: navigationTransferBytes,
    navigation_encoded_body_bytes: navigationEncodedBodyBytes,
    organization_attributed: organizationId !== null,
    recorded_at: new Date().toISOString(),
    persisted: !persistError,
  }));

  return new NextResponse(null, { status: 202 });
}
