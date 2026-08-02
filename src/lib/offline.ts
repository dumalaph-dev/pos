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

export type PendingOrder = {
  id?: number;
  local_uuid: string;
  p_order: Record<string, unknown>;
  p_items: unknown[];
  created_at: string;
  attempts: number;
};

type PosDB = Dexie & {
  outbox: Table<PendingOrder, number>;
  catalog: Table<{ key: string; json: string }, string>;
};

let _db: PosDB | null = null;
function getDb(): PosDB {
  if (_db) return _db;
  const db = new Dexie("pos-db") as PosDB;
  db.version(1).stores({
    outbox: "++id, local_uuid, created_at",
    catalog: "key",
  });
  _db = db;
  return db;
}

/* ── Device identity + order numbers ─────────────────────────────────── */

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem("pos.device.id");
    if (!id) {
      id = "D" + Math.random().toString(36).slice(2, 8).toUpperCase();
      localStorage.setItem("pos.device.id", id);
    }
    return id;
  } catch {
    return "D" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
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

export async function pendingCount(): Promise<number> {
  return getDb().outbox.count();
}

/** Subscribe to outbox size changes; returns an unsubscribe fn. */
export function watchPending(cb: (n: number) => void): () => void {
  const subscription = liveQuery(() => getDb().outbox.count()).subscribe({
    next: cb,
    error: () => {},
  });
  return () => subscription.unsubscribe();
}

/**
 * Replay every queued order through `place_order`. The RPC is idempotent on
 * local_uuid, so replays are safe. Returns how many orders were confirmed.
 */
export async function flushOutbox(client: {
  rpc: (fn: string, args: unknown) => PromiseLike<{ error: unknown }>;
}): Promise<number> {
  const db = getDb();
  const pending = await db.outbox.orderBy("created_at").toArray();
  let synced = 0;
  for (const item of pending) {
    let error: unknown = null;
    try {
      const res = await client.rpc("place_order", {
        p_order: item.p_order,
        p_items: item.p_items,
      });
      error = res.error ?? null;
    } catch (e) {
      error = e; // network failure — keep queued, retry later
    }
    if (error) {
      await db.outbox.update(item.id!, { attempts: item.attempts + 1 });
      continue;
    }
    await db.outbox.delete(item.id!);
    synced++;
  }
  return synced;
}

/* ── Catalog cache ───────────────────────────────────────────────────── */

type CachedCatalog = {
  products: unknown[];
  categories: unknown[];
  profile: unknown;
  stock?: Record<string, number>;
};

export async function saveCatalogCache(
  products: unknown[],
  categories: unknown[],
  profile: unknown,
  stock?: Record<string, number>,
): Promise<void> {
  const db = getDb();
  const rows = [
    { key: "products", json: JSON.stringify(products) },
    { key: "categories", json: JSON.stringify(categories) },
    { key: "profile", json: JSON.stringify(profile) },
  ];
  if (stock) rows.push({ key: "stock", json: JSON.stringify(stock) });
  await db.catalog.bulkPut(rows);
}

export async function loadCachedCatalog(): Promise<CachedCatalog | null> {
  const db = getDb();
  const rows = await db.catalog.bulkGet(["products", "categories", "profile"]);
  if (!rows[0] || !rows[1] || !rows[2]) return null;
  return {
    products: JSON.parse(rows[0].json),
    categories: JSON.parse(rows[1].json),
    profile: JSON.parse(rows[2].json),
    stock: rows[3]?.json ? JSON.parse(rows[3].json) : undefined,
  };
}
