import { NextResponse } from "next/server";
import {
  PLATFORM_SYNC_HEALTH_MAX_QUEUE_COUNT,
  PLATFORM_SYNC_HEALTH_QUEUES,
  type PlatformSyncHealthQueue,
} from "@/lib/platform-sync-health";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

const MAX_BODY_LENGTH = 12_288;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoundedInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= PLATFORM_SYNC_HEALTH_MAX_QUEUE_COUNT ? value : null;
}

function readTimestamp(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function readQueue(value: unknown): PlatformSyncHealthQueue | null {
  return typeof value === "string" && PLATFORM_SYNC_HEALTH_QUEUES.includes(value as PlatformSyncHealthQueue)
    ? value as PlatformSyncHealthQueue
    : null;
}

function readQueueSnapshot(value: unknown) {
  if (!isRecord(value)) return null;
  const queue = readQueue(value.queue);
  const pendingCount = readBoundedInteger(value.pending_count);
  const failedCount = readBoundedInteger(value.failed_count);
  const conflictCount = readBoundedInteger(value.conflict_count);
  const stuckCount = value.stuck_count === undefined ? 0 : readBoundedInteger(value.stuck_count);
  const oldestPendingAt = readTimestamp(value.oldest_pending_at);
  const syncSucceeded = value.sync_succeeded === undefined
    ? false
    : typeof value.sync_succeeded === "boolean" ? value.sync_succeeded : null;
  if (queue === null || pendingCount === null || failedCount === null || conflictCount === null || stuckCount === null || syncSucceeded === null || failedCount > pendingCount || conflictCount > pendingCount || stuckCount > pendingCount) return null;
  return {
    queue,
    pending_count: pendingCount,
    failed_count: failedCount,
    conflict_count: conflictCount,
    stuck_count: stuckCount,
    oldest_pending_at: pendingCount > 0 ? oldestPendingAt : null,
    sync_succeeded: syncSucceeded,
  };
}

function isMissingEnhancedSchema(error: unknown) {
  const message = error instanceof Error ? error.message : isRecord(error) && typeof error.message === "string" ? error.message : "";
  return /stuck_count|last_successful_sync_at|column .* does not exist|schema cache/i.test(message);
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

  if (!isRecord(parsed)) return new NextResponse(null, { status: 400 });
  const storeId = typeof parsed.store_id === "string" && UUID_PATTERN.test(parsed.store_id) ? parsed.store_id : null;
  const deviceKey = typeof parsed.device_key === "string" && DEVICE_KEY_PATTERN.test(parsed.device_key) ? parsed.device_key : null;
  const online = typeof parsed.online === "boolean" ? parsed.online : null;
  const queues = Array.isArray(parsed.queues) && parsed.queues.length > 0 && parsed.queues.length <= PLATFORM_SYNC_HEALTH_QUEUES.length
    ? parsed.queues.map(readQueueSnapshot)
    : null;
  if (!storeId || !deviceKey || online === null || !queues || queues.some((queue) => queue === null)) return new NextResponse(null, { status: 400 });

  const uniqueQueues = new Set(queues.map((queue) => queue!.queue));
  if (uniqueQueues.size !== queues.length) return new NextResponse(null, { status: 400 });

  const user = await getAuthenticatedUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const organizationId = typeof profile?.org_id === "string" ? profile.org_id : null;
  if (profileError || !organizationId) return new NextResponse(null, { status: 403 });

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("org_id", organizationId)
    .maybeSingle();
  if (storeError || !store) return new NextResponse(null, { status: 403 });

  const recordedAt = new Date().toISOString();
  const enrichedResult = await supabase
    .from("admin_sync_health_snapshots")
    .upsert(
      queues.map((queue) => ({
        org_id: organizationId,
        store_id: store.id,
        device_key: deviceKey,
        queue: queue!.queue,
        pending_count: queue!.pending_count,
        failed_count: queue!.failed_count,
        conflict_count: queue!.conflict_count,
        stuck_count: queue!.stuck_count,
        oldest_pending_at: queue!.oldest_pending_at,
        last_successful_sync_at: queue!.sync_succeeded ? recordedAt : null,
        online,
        recorded_at: recordedAt,
      })),
      { onConflict: "org_id,store_id,device_key,queue" },
    );
  let persistError = enrichedResult.error;

  // Keep the rollout safe for a server whose 0080 table is present while the
  // additive 0081 columns are still being applied. The database trigger in
  // 0081 preserves an earlier success timestamp on non-success reports.
  if (persistError && isMissingEnhancedSchema(persistError)) {
    const legacyResult = await supabase
      .from("admin_sync_health_snapshots")
      .upsert(
        queues.map((queue) => ({
          org_id: organizationId,
          store_id: store.id,
          device_key: deviceKey,
          queue: queue!.queue,
          pending_count: queue!.pending_count,
          failed_count: queue!.failed_count,
          conflict_count: queue!.conflict_count,
          oldest_pending_at: queue!.oldest_pending_at,
          online,
          recorded_at: recordedAt,
        })),
        { onConflict: "org_id,store_id,device_key,queue" },
      );
    persistError = legacyResult.error;
  }

  // Keep deployment logs useful without persisting identifiers, queue payloads,
  // error messages, or organization data outside the telemetry table.
  console.info(JSON.stringify({
    event: "dumala_sync_health",
    queues: queues.map((queue) => queue!.queue),
    online,
    persisted: !persistError,
    enhanced_metrics: queues.some((queue) => queue!.stuck_count > 0 || queue!.sync_succeeded),
    recorded_at: recordedAt,
  }));

  return new NextResponse(null, { status: persistError ? 503 : 202 });
}
