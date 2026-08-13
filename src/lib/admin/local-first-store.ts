import Dexie, { type Table } from "dexie";
import type { StockMovementType } from "@/lib/inventory";

export const ADMIN_LOCAL_FIRST_SCHEMA_VERSION = 2;

export type AdminCacheEntity =
  | "order_receipts"
  | "shifts"
  | "z_readings"
  | "inventory"
  | "inventory_movements"
  | "inventory_variance"
  | "audit"
  | "products"
  | "customers"
  | "suppliers"
  | "employees"
  | "expenses"
  | "branches";

/** Read models safe to show in the device-local admin recovery shell. */
export const ADMIN_OFFLINE_READ_ENTITIES = [
  "order_receipts",
  "shifts",
  "z_readings",
  "inventory",
  "inventory_movements",
  "inventory_variance",
  "audit",
] as const satisfies readonly AdminCacheEntity[];

export type AdminOfflineReadEntity = (typeof ADMIN_OFFLINE_READ_ENTITIES)[number];

export type AdminCacheScope = {
  userId: string;
  orgId: string;
  storeId: string | null;
  role?: string | null;
};

export type AdminCacheRecord<T = unknown> = {
  id: string;
  data: T;
  fetchedAt: string;
  schemaVersion: number;
};

export type AdminCacheSnapshot = {
  key: string;
  scopeKey: string;
  entity: AdminCacheEntity;
  fetchedAt: string;
  schemaVersion: number;
  recordCount: number;
};

export type AdminOfflineCacheStatus = {
  ready: boolean;
  lastSyncedAt: string | null;
  entities: Partial<Record<AdminOfflineReadEntity, AdminCacheSnapshot>>;
};

export type AdminInventoryMovementPayload = {
  storeId: string;
  productId: string;
  type: Exclude<StockMovementType, "sale">;
  qty: number;
  unitCostCentavos: number | null;
  reason: string | null;
};

export type AdminInventoryCountPayload = {
  storeId: string;
  countDate: string;
  counts: Array<{ product_id: string; counted_qty: number }>;
};

export type AdminMutationKind = "inventory_movement" | "inventory_count";
export type AdminMutationPayload = AdminInventoryMovementPayload | AdminInventoryCountPayload;
export type AdminMutationStatus = "queued" | "syncing" | "failed" | "conflict";

export type AdminMutationRecord = {
  id: string;
  scopeKey: string;
  scope: AdminCacheScope;
  kind: AdminMutationKind;
  payload: AdminMutationPayload;
  createdAt: string;
  attempts: number;
  status: AdminMutationStatus;
  lastError: string | null;
  nextAttemptAt: string | null;
};

export type AdminMutationSyncResult = {
  synced: number;
  failed: number;
  conflicts: number;
  lastError: string | null;
  pending: number;
};

type AdminMutationSyncClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown; data?: unknown }>;
};

type StoredAdminRecord = {
  key: string;
  scopeKey: string;
  entity: AdminCacheEntity;
  entityId: string;
  json: string;
  fetchedAt: string;
  schemaVersion: number;
};

type AdminLocalFirstDb = Dexie & {
  records: Table<StoredAdminRecord, string>;
  snapshots: Table<AdminCacheSnapshot, string>;
  mutations: Table<AdminMutationRecord, string>;
};

let dbInstance: AdminLocalFirstDb | null = null;

function getDb(): AdminLocalFirstDb {
  if (typeof indexedDB === "undefined") throw new Error("Admin local storage is unavailable.");
  if (dbInstance) return dbInstance;

  const db = new Dexie("dumala-admin-db") as AdminLocalFirstDb;
  db.version(1).stores({
    records: "&key, [scopeKey+entity], scopeKey, entity, entityId, fetchedAt",
    snapshots: "&key, scopeKey, entity, fetchedAt",
  });
  db.version(ADMIN_LOCAL_FIRST_SCHEMA_VERSION).stores({
    records: "&key, [scopeKey+entity], scopeKey, entity, entityId, fetchedAt",
    snapshots: "&key, scopeKey, entity, fetchedAt",
    mutations: "&id, [scopeKey+status], scopeKey, status, createdAt, nextAttemptAt",
  });
  dbInstance = db;
  return db;
}

export function createAdminCacheScopeKey(scope: AdminCacheScope): string {
  return [scope.orgId, scope.userId, scope.storeId ?? "*", scope.role ?? "unknown"]
    .map((value) => encodeURIComponent(value))
    .join("|");
}

function snapshotKey(scopeKey: string, entity: AdminCacheEntity): string {
  return `${scopeKey}:${entity}`;
}

function recordKey(scopeKey: string, entity: AdminCacheEntity, entityId: string): string {
  return `${scopeKey}:${entity}:${entityId}`;
}

function serialize(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("Admin cache values must be JSON-serializable.");
  return json;
}

function deserialize<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function replaceAdminCacheRecords<T>(
  scope: AdminCacheScope,
  entity: AdminCacheEntity,
  records: Array<{ id: string; data: T }>,
  fetchedAt = new Date().toISOString(),
): Promise<AdminCacheSnapshot> {
  const db = getDb();
  const scopeKey = createAdminCacheScopeKey(scope);
  const snapshot: AdminCacheSnapshot = {
    key: snapshotKey(scopeKey, entity),
    scopeKey,
    entity,
    fetchedAt,
    schemaVersion: ADMIN_LOCAL_FIRST_SCHEMA_VERSION,
    recordCount: records.length,
  };
  const rows = records.map((record) => ({
    key: recordKey(scopeKey, entity, record.id),
    scopeKey,
    entity,
    entityId: record.id,
    json: serialize(record.data),
    fetchedAt,
    schemaVersion: ADMIN_LOCAL_FIRST_SCHEMA_VERSION,
  }));

  await db.transaction("rw", db.records, db.snapshots, async () => {
    await db.records.where("[scopeKey+entity]").equals([scopeKey, entity]).delete();
    if (rows.length) await db.records.bulkPut(rows);
    await db.snapshots.put(snapshot);
  });
  return snapshot;
}

/** Upsert a partial read model while preserving records cached by other pages. */
export async function upsertAdminCacheRecords<T>(
  scope: AdminCacheScope,
  entity: AdminCacheEntity,
  records: Array<{ id: string; data: T }>,
  fetchedAt = new Date().toISOString(),
): Promise<AdminCacheSnapshot> {
  const db = getDb();
  const scopeKey = createAdminCacheScopeKey(scope);
  const rows = records.map((record) => ({
    key: recordKey(scopeKey, entity, record.id),
    scopeKey,
    entity,
    entityId: record.id,
    json: serialize(record.data),
    fetchedAt,
    schemaVersion: ADMIN_LOCAL_FIRST_SCHEMA_VERSION,
  }));

  return db.transaction("rw", db.records, db.snapshots, async () => {
    if (rows.length) await db.records.bulkPut(rows);
    const recordCount = await db.records.where("[scopeKey+entity]").equals([scopeKey, entity]).count();
    const snapshot: AdminCacheSnapshot = {
      key: snapshotKey(scopeKey, entity),
      scopeKey,
      entity,
      fetchedAt,
      schemaVersion: ADMIN_LOCAL_FIRST_SCHEMA_VERSION,
      recordCount,
    };
    await db.snapshots.put(snapshot);
    return snapshot;
  });
}

export async function getAdminCacheRecords<T>(
  scope: AdminCacheScope,
  entity: AdminCacheEntity,
): Promise<Array<AdminCacheRecord<T>>> {
  const scopeKey = createAdminCacheScopeKey(scope);
  const rows = await getDb().records.where("[scopeKey+entity]").equals([scopeKey, entity]).toArray();
  return rows.flatMap((row) => {
    const data = deserialize<T>(row.json);
    return data === null
      ? []
      : [{ id: row.entityId, data, fetchedAt: row.fetchedAt, schemaVersion: row.schemaVersion }];
  });
}

export async function getAdminCacheSnapshot(
  scope: AdminCacheScope,
  entity: AdminCacheEntity,
): Promise<AdminCacheSnapshot | null> {
  return (await getDb().snapshots.get(snapshotKey(createAdminCacheScopeKey(scope), entity))) ?? null;
}

/**
 * Fast readiness check used before unlocking the offline admin shell. A
 * snapshot is not authorization; the PIN's explicit admin scope and this
 * exact cache scope must both match before the read models are rendered.
 */
export async function getAdminOfflineCacheStatus(scope: AdminCacheScope): Promise<AdminOfflineCacheStatus> {
  const snapshots = await Promise.all(
    ADMIN_OFFLINE_READ_ENTITIES.map(async (entity) => [entity, await getAdminCacheSnapshot(scope, entity)] as const),
  );
  const entities: Partial<Record<AdminOfflineReadEntity, AdminCacheSnapshot>> = {};
  for (const [entity, snapshot] of snapshots) {
    if (snapshot) entities[entity] = snapshot;
  }
  const syncedAt = Object.values(entities)
    .map((snapshot) => snapshot?.fetchedAt ?? null)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  return {
    ready: Object.values(entities).some((snapshot) => (snapshot?.recordCount ?? 0) > 0),
    lastSyncedAt: syncedAt,
    entities,
  };
}

function createAdminMutationId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  const random = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${random()}-${random().slice(0, 4)}-4${random().slice(0, 3)}-8${random().slice(0, 3)}-${random()}${random().slice(0, 4)}`;
}

function mutationErrorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message.slice(0, 240);
  if (typeof reason === "object" && reason !== null && "message" in reason && typeof reason.message === "string") {
    return reason.message.slice(0, 240);
  }
  return "The offline change could not be synced.";
}

function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60 * 1000, 5 * 1000 * 2 ** Math.max(0, attempts - 1));
}

function isPermanentMutationError(reason: unknown): boolean {
  const message = mutationErrorMessage(reason).toLowerCase();
  return [
    "only admins",
    "organization context",
    "branch is not active",
    "branch is not valid",
    "product and branch",
    "enable stock tracking",
    "movement quantity is invalid",
    "reason is required",
    "count date is required",
    "at least one product count",
    "counted quantity must be",
    "not valid for this branch",
    "client mutation id is already assigned",
    "permission denied",
  ].some((fragment) => message.includes(fragment));
}

function mutationScopeKey(scope: AdminCacheScope): string {
  return createAdminCacheScopeKey(scope);
}

function assertMutationPayload(kind: AdminMutationKind, payload: AdminMutationPayload): void {
  if (kind === "inventory_movement") {
    const movement = payload as AdminInventoryMovementPayload;
    if (!movement.storeId || !movement.productId || !movement.type || !Number.isFinite(movement.qty) || movement.qty === 0) {
      throw new Error("Enter a valid stock movement before saving it on this device.");
    }
    if (movement.type !== "adjust" && movement.qty < 0) {
      throw new Error("Use a positive quantity for this stock movement.");
    }
    if ((movement.type === "waste" || movement.type === "adjust") && !movement.reason) {
      throw new Error("A reason is required for waste and adjustment movements.");
    }
    if (movement.unitCostCentavos !== null && (!Number.isFinite(movement.unitCostCentavos) || movement.unitCostCentavos < 0)) {
      throw new Error("Unit cost must be a valid non-negative amount.");
    }
    return;
  }

  const count = payload as AdminInventoryCountPayload;
  if (!count.storeId || !/^\d{4}-\d{2}-\d{2}$/.test(count.countDate) || count.counts.length === 0) {
    throw new Error("Enter a valid branch, count date, and at least one physical count.");
  }
  if (count.counts.some((item) => !item.product_id || !Number.isFinite(item.counted_qty) || item.counted_qty < 0)) {
    throw new Error("Every physical count must be zero or greater.");
  }
}

export function createAdminMutationKey(): string {
  return createAdminMutationId();
}

export async function enqueueAdminMutation(
  scope: AdminCacheScope,
  kind: AdminMutationKind,
  payload: AdminMutationPayload,
  id = createAdminMutationId(),
): Promise<string> {
  if (!scope.userId || !scope.orgId || !scope.storeId) {
    throw new Error("Select a branch before saving an offline admin change.");
  }
  assertMutationPayload(kind, payload);
  const payloadStoreId = (payload as AdminInventoryMovementPayload | AdminInventoryCountPayload).storeId;
  if (payloadStoreId !== scope.storeId) {
    throw new Error("The offline change must stay within the selected branch scope.");
  }
  const db = getDb();
  const scopeKey = mutationScopeKey(scope);
  const existing = await db.mutations.get(id);
  if (existing) {
    if (existing.scopeKey !== scopeKey || existing.kind !== kind) {
      throw new Error("This offline change identifier is already assigned to another action.");
    }
    return id;
  }
  await db.mutations.add({
    id,
    scopeKey,
    scope,
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "queued",
    lastError: null,
    nextAttemptAt: null,
  });
  return id;
}

export async function getAdminMutationRecords(scope: AdminCacheScope): Promise<AdminMutationRecord[]> {
  return (await getDb().mutations.where("scopeKey").equals(mutationScopeKey(scope)).toArray())
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function getAdminMutationStatus(scope: AdminCacheScope): Promise<{ pending: number; failed: number; conflicts: number; lastError: string | null }> {
  const records = await getAdminMutationRecords(scope);
  const failed = records.filter((record) => record.status === "failed");
  const conflicts = records.filter((record) => record.status === "conflict");
  return {
    pending: records.length,
    failed: failed.length,
    conflicts: conflicts.length,
    lastError: [...failed, ...conflicts].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1)?.lastError ?? null,
  };
}

async function sendAdminMutation(client: AdminMutationSyncClient, record: AdminMutationRecord): Promise<void> {
  if (record.kind === "inventory_movement") {
    const payload = record.payload as AdminInventoryMovementPayload;
    const { error } = await client.rpc("record_stock_movement", {
      p_store_id: payload.storeId,
      p_product_id: payload.productId,
      p_type: payload.type,
      p_qty: payload.qty,
      p_unit_cost: payload.unitCostCentavos,
      p_reason: payload.reason,
      p_client_mutation_id: record.id,
    });
    if (error) throw new Error(mutationErrorMessage(error));
    return;
  }

  const payload = record.payload as AdminInventoryCountPayload;
  const { error } = await client.rpc("record_inventory_count", {
    p_store_id: payload.storeId,
    p_count_date: payload.countDate,
    p_counts: payload.counts,
    p_client_mutation_id: record.id,
  });
  if (error) throw new Error(mutationErrorMessage(error));
}

export async function flushAdminMutationOutbox(
  client: AdminMutationSyncClient,
  scope: AdminCacheScope,
): Promise<AdminMutationSyncResult> {
  const db = getDb();
  const now = Date.now();
  const records = await getAdminMutationRecords(scope);
  let synced = 0;
  let failed = 0;
  let conflicts = 0;
  let lastError: string | null = null;

  for (const record of records) {
    if (record.status === "conflict") {
      conflicts += 1;
      lastError ??= record.lastError;
      continue;
    }
    const nextAttemptAt = record.nextAttemptAt ? new Date(record.nextAttemptAt).getTime() : 0;
    if (record.status === "failed" && Number.isFinite(nextAttemptAt) && nextAttemptAt > now) continue;

    await db.mutations.update(record.id, { status: "syncing", lastError: null });
    try {
      await sendAdminMutation(client, record);
      await db.mutations.delete(record.id);
      synced += 1;
    } catch (error) {
      const message = mutationErrorMessage(error);
      const attempts = record.attempts + 1;
      const conflict = isPermanentMutationError(error);
      await db.mutations.update(record.id, {
        status: conflict ? "conflict" : "failed",
        attempts,
        lastError: message,
        nextAttemptAt: conflict ? null : new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
      });
      if (conflict) conflicts += 1;
      else failed += 1;
      lastError = message;
    }
  }

  const pending = await db.mutations.where("scopeKey").equals(mutationScopeKey(scope)).count();
  return { synced, failed, conflicts, lastError, pending };
}

export async function clearAdminLocalFirstScope(scope: AdminCacheScope): Promise<void> {
  const db = getDb();
  const scopeKey = createAdminCacheScopeKey(scope);
  await db.transaction("rw", db.records, db.snapshots, async () => {
    await db.records.where("scopeKey").equals(scopeKey).delete();
    await db.snapshots.where("scopeKey").equals(scopeKey).delete();
  });
}

/** Clear private admin read data; safe to call during sign-out cleanup. */
export async function clearAdminLocalFirstCache(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = getDb();
    await db.transaction("rw", db.records, db.snapshots, async () => {
      await db.records.clear();
      await db.snapshots.clear();
    });
  } catch {
    // Sign-out must continue even when IndexedDB is unavailable or corrupt.
  }
}
