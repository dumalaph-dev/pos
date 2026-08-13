/**
 * P2 offline layer: local-first writes and catalog cache (Dexie/IndexedDB).
 *
 * - Orders are written to the `outbox` first; the UI never awaits the network.
 * - `flushOutbox` replays them through `place_order` (idempotent on
 *   local_uuid — safe to retry forever; server returns the same order).
 * - The catalog cache lets the sell grid work with the API down.
 * - Order numbers: {branch}-{device}-{yyMMdd}-{seq} (per-device daily seq).
 */
import Dexie, { liveQuery, type Table } from "dexie";

import { isDisplayGalleryItem, isDisplayPromotion, isDisplaySettings, type DisplayGalleryItem, type DisplayPromotion, type DisplaySettings } from "@/lib/display";
import { reportError, reportSyncFailure } from "@/lib/monitoring";

export type PendingOrder = {
  id?: number;
  local_uuid: string;
  p_order: Record<string, unknown>;
  p_items: unknown[];
  created_at: string;
  attempts: number;
};

export type PendingAuditLog = {
  id?: number;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
};

export type OfflineSyncScope = {
  userId: string;
  orgId: string;
  storeId: string | null;
};

export type SyncBatchResult = {
  synced: number;
  failed: number;
  lastError: string | null;
};

export type OfflineProfileSnapshot = {
  id: string;
  org_id: string;
  store_id: string | null;
  store_name: string | null;
  store_address: string | null;
  store_tin: string | null;
  brand_logo_url: string | null;
  full_name: string | null;
  role: "admin" | "manager" | "cashier" | null;
  /** Organization policy used to gate custom discounts while the till is online. */
  discount_threshold?: number;
  device_id?: string | null;
  display_pairing_token?: string | null;
  display_promotions?: DisplayPromotion[];
  display_gallery?: DisplayGalleryItem[];
  display_settings?: DisplaySettings;
  pos_config?: unknown;
};

/**
 * Explicit, device-local permission to reopen cached admin read models.
 *
 * This is deliberately narrower than a Supabase session: it never authorizes
 * a server mutation and it is only accepted for admin/manager profiles on the
 * same organization and branch context that was approved online.
 */
export type OfflineAdminScope = {
  org_id: string;
  store_id: string | null;
  role: "admin" | "manager";
  enabled_at: string;
};

export const OFFLINE_PIN_MIN_LENGTH = 4;
export const OFFLINE_PIN_MAX_LENGTH = 6;
export const OFFLINE_PIN_MAX_ATTEMPTS = 5;
export const OFFLINE_PIN_LOCKOUT_MS = 60_000;
const OFFLINE_PIN_PBKDF2_ITERATIONS = 120_000;

export type OfflineCredential = {
  id: "active";
  user_id: string;
  device_id: string;
  profile: OfflineProfileSnapshot;
  salt: string;
  verifier: string;
  iterations: number;
  failed_attempts: number;
  locked_until: number | null;
  updated_at: string;
  /** Missing on credentials enrolled before offline admin recovery shipped. */
  admin_scope?: OfflineAdminScope | null;
};

export type OfflinePinVerificationResult =
  | { ok: true; credential: OfflineCredential }
  | {
      ok: false;
      reason: "unavailable" | "invalid" | "locked";
      remainingAttempts: number;
      lockedUntil: number | null;
    };

export const OFFLINE_PARKED_ORDER_KEY = "pos.parked.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOfflineProfileSnapshot(value: unknown): value is OfflineProfileSnapshot {
  if (!isRecord(value)) return false;
  const role = value.role;
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.org_id === "string" && value.org_id.length > 0 &&
    isNullableString(value.store_id) &&
    isNullableString(value.store_name) &&
    isNullableString(value.store_address) &&
    isNullableString(value.store_tin) &&
    isNullableString(value.brand_logo_url) &&
    isNullableString(value.full_name) &&
    (role === null || role === "admin" || role === "manager" || role === "cashier") &&
    (value.discount_threshold === undefined || (typeof value.discount_threshold === "number" && Number.isFinite(value.discount_threshold) && value.discount_threshold >= 0 && value.discount_threshold <= 100)) &&
    (value.display_pairing_token === undefined || isNullableString(value.display_pairing_token)) &&
    (value.display_promotions === undefined || (Array.isArray(value.display_promotions) && value.display_promotions.every(isDisplayPromotion))) &&
    (value.display_gallery === undefined || (Array.isArray(value.display_gallery) && value.display_gallery.every(isDisplayGalleryItem))) &&
    (value.display_settings === undefined || isDisplaySettings(value.display_settings))
  );
}

function isOfflineAdminScopeForProfile(value: unknown, profile: OfflineProfileSnapshot): value is OfflineAdminScope {
  if (!isRecord(value)) return false;
  return (
    typeof value.org_id === "string" && value.org_id.length > 0 && value.org_id === profile.org_id &&
    isNullableString(value.store_id) &&
    (value.role === "admin" || value.role === "manager") && value.role === profile.role &&
    typeof value.enabled_at === "string" && value.enabled_at.length > 0
  );
}

function isCachedProduct(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    (value.pricing_mode === "fixed" || value.pricing_mode === "per_kg") &&
    typeof value.price === "number" && Number.isFinite(value.price) &&
    typeof value.unit === "string" && value.unit.length > 0 &&
    (typeof value.category_id === "string" || value.category_id === null) &&
    (value.image_url === undefined || isNullableString(value.image_url)) &&
    (value.track_stock === undefined || typeof value.track_stock === "boolean") &&
    (value.min_stock === undefined || value.min_stock === null || (typeof value.min_stock === "number" && Number.isFinite(value.min_stock)))
  );
}

function isCachedCategory(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    isNullableString(value.icon)
  );
}

function isOfflineCredential(value: unknown): value is OfflineCredential {
  if (!isRecord(value) || value.id !== "active") return false;
  return (
    typeof value.user_id === "string" && value.user_id.length > 0 &&
    typeof value.device_id === "string" && value.device_id.length > 0 &&
    isOfflineProfileSnapshot(value.profile) && value.user_id === value.profile.id &&
    typeof value.salt === "string" && value.salt.length > 0 &&
    typeof value.verifier === "string" && value.verifier.length > 0 &&
    typeof value.iterations === "number" && value.iterations === OFFLINE_PIN_PBKDF2_ITERATIONS &&
    typeof value.failed_attempts === "number" && Number.isInteger(value.failed_attempts) && value.failed_attempts >= 0 &&
    (value.locked_until === null || (typeof value.locked_until === "number" && Number.isFinite(value.locked_until))) &&
    typeof value.updated_at === "string" && value.updated_at.length > 0 &&
    (value.admin_scope === undefined || value.admin_scope === null || isOfflineAdminScopeForProfile(value.admin_scope, value.profile))
  );
}

function catalogScope(profile: OfflineProfileSnapshot): string {
  return profile.store_id || profile.org_id || "default";
}

function matchesOrderScope(order: Record<string, unknown>, scope: OfflineSyncScope): boolean {
  return (
    order.cashier_id === scope.userId &&
    order.org_id === scope.orgId &&
    order.store_id === scope.storeId
  );
}

function matchesAuditScope(payload: Record<string, unknown>, scope: OfflineSyncScope): boolean {
  return (
    payload.actor_id === scope.userId &&
    payload.org_id === scope.orgId &&
    payload.store_id === scope.storeId
  );
}

function syncErrorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message.slice(0, 240);
  if (isRecord(reason) && typeof reason.message === "string") return reason.message.slice(0, 240);
  return "Unknown sync error";
}

type PosDB = Dexie & {
  outbox: Table<PendingOrder, number>;
  auditOutbox: Table<PendingAuditLog, number>;
  catalog: Table<{ key: string; json: string }, string>;
  offlineAuth: Table<OfflineCredential, string>;
};

type OrderSyncClient = {
  rpc: (fn: string, args: unknown) => PromiseLike<{ error: unknown; data?: unknown }>;
};

let _db: PosDB | null = null;
function getDb(): PosDB {
  if (_db) return _db;
  const db = new Dexie("pos-db") as PosDB;
  db.version(1).stores({
    outbox: "++id, local_uuid, created_at",
    catalog: "key",
  });
  db.version(2).stores({
    outbox: "++id, local_uuid, created_at",
    auditOutbox: "++id, created_at",
    catalog: "key",
  });
  db.version(3).stores({
    outbox: "++id, local_uuid, created_at",
    auditOutbox: "++id, created_at",
    catalog: "key",
    offlineAuth: "id",
  });
  _db = db;
  return db;
}

/* ── Device identity + order numbers ─────────────────────────────────── */

let volatileDeviceId: string | null = null;

function createDeviceId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return `D${(randomUuid ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function readDeviceId(): { id: string; persistent: boolean } {
  try {
    let id = localStorage.getItem("pos.device.id");
    if (!id) {
      id = createDeviceId();
      localStorage.setItem("pos.device.id", id);
    }
    return { id, persistent: true };
  } catch {
    // Some privacy modes expose IndexedDB but deny localStorage. Keep a stable
    // per-page fallback so enrollment and unlock still agree in that mode.
    volatileDeviceId ??= createDeviceId();
    return { id: volatileDeviceId, persistent: false };
  }
}

export function getDeviceId(): string {
  return readDeviceId().id;
}

function yymmdd(d: Date): string {
  return d.toISOString().slice(2, 10).replace(/-/g, "");
}

/** Per-device, per-day sequence (localStorage) — {branch}-{device}-{yyMMdd}-{seq}. */
export function buildOrderNo(branchPrefix: string): string {
  const date = yymmdd(new Date());
  let seq = 0;
  try {
    const key = `pos.seq.${date}`;
    seq = (Number(localStorage.getItem(key)) || 0) + 1;
    localStorage.setItem(key, String(seq));
  } catch {
    seq = Math.floor(Math.random() * 9000) + 1000;
  }
  return `${branchPrefix}-${getDeviceId()}-${date}-${String(seq).padStart(4, "0")}`;
}

/* ── Outbox ──────────────────────────────────────────────────────────── */

export async function enqueueOrder(
  p_order: Record<string, unknown>,
  p_items: unknown[],
): Promise<void> {
  await getDb().outbox.add({
    local_uuid: p_order.local_uuid as string,
    p_order,
    p_items,
    created_at: new Date().toISOString(),
    attempts: 0,
  });
}

export async function pendingCount(scope: OfflineSyncScope): Promise<number> {
  const db = getDb();
  const [pendingOrders, pendingAudits] = await Promise.all([
    db.outbox.toArray(),
    db.auditOutbox.toArray(),
  ]);
  return (
    pendingOrders.filter((item) => matchesOrderScope(item.p_order, scope)).length +
    pendingAudits.filter((item) => matchesAuditScope(item.payload, scope)).length
  );
}

/**
 * Remove cached profile/catalog data at sign-out while preserving the outbox.
 * Unsynced sales are operational data and must survive a shift change; the
 * catalog and profile are session data and must not be shown to the next user.
 */
export async function clearOfflineSession(): Promise<void> {
  const db = getDb();
  try {
    await db.transaction("rw", db.catalog, db.offlineAuth, async () => {
      await db.catalog.clear();
      await db.offlineAuth.clear();
    });
  } catch {
    // If one table is corrupt, still make an independent best effort to clear
    // the credential before sign-out completes.
    await db.catalog.clear().catch(() => {});
    await db.offlineAuth.clear().catch(() => {});
  }
  try {
    // Parked carts are cashier/session data, not device configuration. Leaving
    // them behind would expose the previous cashier's held order to the next
    // shift even though the catalog and PIN were cleared.
    localStorage.removeItem(OFFLINE_PARKED_ORDER_KEY);
  } catch {
    // Storage failures must never block sign-out.
  }
}

function isPin(pin: string): boolean {
  return new RegExp(`^\\d{${OFFLINE_PIN_MIN_LENGTH},${OFFLINE_PIN_MAX_LENGTH}}$`).test(pin);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePinVerifier(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function getOfflineCredential(): Promise<OfflineCredential | null> {
  try {
    const credential = await getDb().offlineAuth.get("active");
    return isOfflineCredential(credential) ? credential : null;
  } catch {
    return null;
  }
}

export function getOfflineAdminScope(credential: OfflineCredential | null): OfflineAdminScope | null {
  const scope = credential?.admin_scope;
  return scope && isOfflineAdminScopeForProfile(scope, credential.profile) ? scope : null;
}

export function isOfflineAdminCredential(credential: OfflineCredential | null): boolean {
  return Boolean(getOfflineAdminScope(credential));
}

/** Save a salted, device-local PIN verifier. The raw PIN is never persisted. */
export async function enrollOfflineCredential(
  profile: OfflineProfileSnapshot,
  pin: string,
  options: { adminScope?: OfflineAdminScope | null } = {},
): Promise<OfflineCredential> {
  if (!isPin(pin)) {
    throw new Error(`Offline PIN must be ${OFFLINE_PIN_MIN_LENGTH} to ${OFFLINE_PIN_MAX_LENGTH} digits.`);
  }
  if (!isOfflineProfileSnapshot(profile)) throw new Error("A signed-in profile is required.");

  const existing = await getOfflineCredential();
  const requestedAdminScope = Object.prototype.hasOwnProperty.call(options, "adminScope")
    ? options.adminScope ?? null
    : existing?.user_id === profile.id && existing.profile.org_id === profile.org_id
      ? getOfflineAdminScope(existing)
      : null;
  if (requestedAdminScope && !isOfflineAdminScopeForProfile(requestedAdminScope, profile)) {
    throw new Error("Offline admin access must match the signed-in admin profile.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await derivePinVerifier(pin, salt, OFFLINE_PIN_PBKDF2_ITERATIONS);
  const credential: OfflineCredential = {
    id: "active",
    user_id: profile.id,
    device_id: getDeviceId(),
    profile,
    salt: bytesToBase64(salt),
    verifier: bytesToBase64(verifier),
    iterations: OFFLINE_PIN_PBKDF2_ITERATIONS,
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
    admin_scope: requestedAdminScope,
  };
  await getDb().offlineAuth.put(credential);
  return credential;
}

let pinVerificationQueue: Promise<void> = Promise.resolve();

type PinTransactionResult =
  | { kind: "retry" }
  | { kind: "result"; value: OfflinePinVerificationResult };

function sameVerifier(left: OfflineCredential, right: OfflineCredential): boolean {
  return (
    left.user_id === right.user_id &&
    left.device_id === right.device_id &&
    left.salt === right.salt &&
    left.verifier === right.verifier &&
    left.iterations === right.iterations
  );
}

async function verifyOfflinePinNow(pin: string): Promise<OfflinePinVerificationResult> {
  let credential = await getOfflineCredential();
  if (!credential) return { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null };

  let device = readDeviceId();
  if (device.persistent && credential.device_id !== device.id) {
    return { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null };
  }
  if (!isPin(pin)) {
    return {
      ok: false,
      reason: "invalid",
      remainingAttempts: Math.max(0, OFFLINE_PIN_MAX_ATTEMPTS - credential.failed_attempts),
      lockedUntil: credential.locked_until,
    };
  }

  // PBKDF2 is intentionally outside the transaction. The transaction only
  // serializes the read/compare/write of the attempt counter across tabs.
  for (let retry = 0; retry < 3; retry++) {
    const snapshot = credential;
    if (snapshot.locked_until !== null && snapshot.locked_until > Date.now()) {
      return { ok: false, reason: "locked", remainingAttempts: 0, lockedUntil: snapshot.locked_until };
    }

    let candidate: Uint8Array;
    let expected: Uint8Array;
    try {
      const salt = base64ToBytes(snapshot.salt);
      expected = base64ToBytes(snapshot.verifier);
      if (salt.length !== 16 || expected.length !== 32) {
        return { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null };
      }
      candidate = await derivePinVerifier(pin, salt, snapshot.iterations);
    } catch {
      return { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null };
    }

    const result = await getDb().transaction("rw", getDb().offlineAuth, async (): Promise<PinTransactionResult> => {
      const current = await getDb().offlineAuth.get("active");
      if (!isOfflineCredential(current)) {
        return {
          kind: "result",
          value: { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null },
        };
      }
      if (!sameVerifier(current, snapshot)) return { kind: "retry" };
      if (device.persistent && current.device_id !== device.id) {
        return {
          kind: "result",
          value: { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null },
        };
      }

      const now = Date.now();
      if (current.locked_until !== null && current.locked_until > now) {
        return {
          kind: "result",
          value: { ok: false, reason: "locked", remainingAttempts: 0, lockedUntil: current.locked_until },
        };
      }

      const failedAttempts = current.locked_until !== null && current.locked_until <= now
        ? 0
        : current.failed_attempts;
      if (constantTimeEqual(candidate, expected)) {
        const unlocked: OfflineCredential = {
          ...current,
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString(),
        };
        await getDb().offlineAuth.put(unlocked);
        return { kind: "result", value: { ok: true, credential: unlocked } };
      }

      const nextFailedAttempts = failedAttempts + 1;
      const nextLockedUntil = nextFailedAttempts >= OFFLINE_PIN_MAX_ATTEMPTS
        ? now + OFFLINE_PIN_LOCKOUT_MS
        : null;
      const updated: OfflineCredential = {
        ...current,
        failed_attempts: nextFailedAttempts,
        locked_until: nextLockedUntil,
        updated_at: new Date().toISOString(),
      };
      await getDb().offlineAuth.put(updated);
      return {
        kind: "result",
        value: {
          ok: false,
          reason: nextLockedUntil ? "locked" : "invalid",
          remainingAttempts: Math.max(0, OFFLINE_PIN_MAX_ATTEMPTS - nextFailedAttempts),
          lockedUntil: nextLockedUntil,
        },
      };
    });

    if (result.kind === "result") return result.value;
    credential = await getOfflineCredential();
    if (!credential) return { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null };
    device = readDeviceId();
    if (device.persistent && credential.device_id !== device.id) {
      return { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null };
    }
  }

  return { ok: false, reason: "unavailable", remainingAttempts: 0, lockedUntil: null };
}

/** Verify offline PIN attempts serially so rapid taps cannot bypass lockout. */
export function verifyOfflinePin(pin: string): Promise<OfflinePinVerificationResult> {
  const operation = pinVerificationQueue.then(() => verifyOfflinePinNow(pin));
  pinVerificationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

/** Read locally saved orders so the POS can show them before server sync. */
export async function listPendingOrders(scope: OfflineSyncScope): Promise<PendingOrder[]> {
  const pending = await getDb().outbox.orderBy("created_at").reverse().toArray();
  return pending.filter((item) => matchesOrderScope(item.p_order, scope));
}

/** Queue an audit event when the network is unavailable. */
export async function enqueueAuditLog(payload: Record<string, unknown>): Promise<void> {
  await getDb().auditOutbox.add({
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
  });
}

type AuditSyncClient = {
  from: (table: "audit_logs") => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  };
};

/** Replay locally queued audit events without blocking the sale or print path. */
export async function flushAuditOutbox(client: AuditSyncClient, scope: OfflineSyncScope): Promise<SyncBatchResult> {
  const db = getDb();
  const pending = (await db.auditOutbox.orderBy("created_at").toArray())
    .filter((item) => matchesAuditScope(item.payload, scope));
  let synced = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const item of pending) {
    let error: unknown = null;
    try {
      const result = await client.from("audit_logs").insert(item.payload);
      error = result.error ?? null;
    } catch (cause) {
      error = cause;
    }
    if (error) {
      failed++;
      lastError = syncErrorMessage(error);
      const attempts = item.attempts + 1;
      await db.auditOutbox.update(item.id!, { attempts });
      reportSyncFailure(error, {
        queue: "audit",
        attempts,
        pending_items: pending.length,
      });
      continue;
    }
    await db.auditOutbox.delete(item.id!);
    synced++;
  }
  return { synced, failed, lastError };
}

async function linkPendingAudits(localUuid: string, entityId: unknown, scope: OfflineSyncScope): Promise<void> {
  if (typeof entityId !== "string" || !entityId) return;
  const db = getDb();
  const queued = await db.auditOutbox.toArray();
  for (const item of queued) {
    const after = item.payload.after;
    if (typeof after !== "object" || after === null) continue;
    const auditAfter = after as Record<string, unknown>;
    if (auditAfter.local_uuid !== localUuid || item.payload.entity_id || !matchesAuditScope(item.payload, scope)) continue;
    await db.auditOutbox.update(item.id!, {
      payload: { ...item.payload, entity_id: entityId },
    });
  }
}

/** Subscribe to outbox size changes; returns an unsubscribe fn. */
export function watchPending(cb: (n: number) => void, scope: OfflineSyncScope): () => void {
  const subscription = liveQuery(async () => {
    const db = getDb();
    const [pendingOrders, pendingAudits] = await Promise.all([
      db.outbox.toArray(),
      db.auditOutbox.toArray(),
    ]);
    return (
      pendingOrders.filter((item) => matchesOrderScope(item.p_order, scope)).length +
      pendingAudits.filter((item) => matchesAuditScope(item.payload, scope)).length
    );
  }).subscribe({
    next: cb,
    error: (error) => reportError(error, { area: "offline-sync", queue: "watch" }),
  });
  return () => subscription.unsubscribe();
}

/**
 * Replay every queued order through `place_order`. The RPC is idempotent on
 * local_uuid, so replays are safe. Returns how many orders were confirmed.
 */
export async function flushOutbox(client: OrderSyncClient, scope: OfflineSyncScope): Promise<SyncBatchResult> {
  const db = getDb();
  const pending = (await db.outbox.orderBy("created_at").toArray())
    .filter((item) => matchesOrderScope(item.p_order, scope));
  let synced = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const item of pending) {
    let error: unknown = null;
    try {
      const res = await client.rpc("place_order", {
        p_order: item.p_order,
        p_items: item.p_items,
      });
      error = res.error ?? null;
      if (!error) await linkPendingAudits(item.local_uuid, res.data, scope);
    } catch (e) {
      error = e; // network failure — keep queued, retry later
    }
    if (error) {
      failed++;
      lastError = syncErrorMessage(error);
      const attempts = item.attempts + 1;
      await db.outbox.update(item.id!, { attempts });
      reportSyncFailure(error, {
        queue: "orders",
        attempts,
        pending_items: pending.length,
      });
      continue;
    }
    await db.outbox.delete(item.id!);
    synced++;
  }
  return { synced, failed, lastError };
}

/* ── Catalog cache ───────────────────────────────────────────────────── */

export type CachedCatalog = {
  products: unknown[];
  categories: unknown[];
  profile: OfflineProfileSnapshot;
  stock?: Record<string, number>;
};

export async function saveCatalogCache(
  products: unknown[],
  categories: unknown[],
  profile: OfflineProfileSnapshot,
  stock?: Record<string, number>,
): Promise<void> {
  const db = getDb();
  const scope = catalogScope(profile);
  const rows = [
    { key: `products:${scope}`, json: JSON.stringify(products) },
    { key: `categories:${scope}`, json: JSON.stringify(categories) },
    { key: "profile", json: JSON.stringify(profile) },
  ];
  if (stock) rows.push({ key: `stock:${scope}`, json: JSON.stringify(stock) });
  await db.transaction("rw", db.catalog, async () => {
    await db.catalog.bulkPut(rows);
    if (!stock) await db.catalog.delete(`stock:${scope}`);
  });
}

export async function loadCachedCatalog(scopeKey?: string, expectedProfileId?: string): Promise<CachedCatalog | null> {
  try {
    const db = getDb();
    const profileRow = await db.catalog.get("profile");
    if (!profileRow) return null;

    let profile: OfflineProfileSnapshot;
    try {
      const parsed: unknown = JSON.parse(profileRow.json);
      if (!isOfflineProfileSnapshot(parsed)) return null;
      profile = parsed;
    } catch {
      return null;
    }

    // The profile row is global for compatibility with the original cache
    // schema. Never combine it with another branch's scoped product rows.
    const profileScope = catalogScope(profile);
    if (scopeKey && scopeKey !== profileScope) return null;
    const scope = scopeKey || profileScope;
    const rows = await db.catalog.bulkGet([
      `products:${scope}`,
      `categories:${scope}`,
      "profile",
      `stock:${scope}`,
    ]);
    // Never fall back to an unscoped legacy catalog when the caller supplied a
    // tablet/branch binding; that could render another branch's menu offline.
    const legacyRows = rows[0] && rows[1]
      ? rows
      : scopeKey
        ? rows
        : await db.catalog.bulkGet(["products", "categories", "profile", "stock"]);
    if (!legacyRows[0] || !legacyRows[1] || !legacyRows[2]) return null;

    const products: unknown = JSON.parse(legacyRows[0].json);
    const categories: unknown = JSON.parse(legacyRows[1].json);
    if (
      !Array.isArray(products) ||
      !Array.isArray(categories) ||
      !products.every(isCachedProduct) ||
      !categories.every(isCachedCategory)
    ) return null;

    let stock: Record<string, number> | undefined;
    if (legacyRows[3]?.json) {
      const parsedStock: unknown = JSON.parse(legacyRows[3].json);
      if (!isRecord(parsedStock)) return null;
      stock = {};
      for (const [productId, quantity] of Object.entries(parsedStock)) {
        if (typeof quantity !== "number" || !Number.isFinite(quantity)) return null;
        stock[productId] = quantity;
      }
    }

    if (expectedProfileId && profile.id !== expectedProfileId) return null;
    return { products, categories, profile, stock };
  } catch {
    // A corrupt/partial IndexedDB row should behave exactly like a cache miss.
    return null;
  }
}
