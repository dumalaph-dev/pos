import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  createOnlineOrderAttentionRateLimiter,
  formatOnlineOrderAttentionMessage,
  getNewOnlinePickupOrderIds,
  getUnacknowledgedOnlinePickupOrders,
  normalizeScopedNewOnlinePickupAlerts,
  type OnlineOrderAttentionRecord,
} from "../src/lib/online-order-alerts.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function order(overrides: Partial<OnlineOrderAttentionRecord> = {}): OnlineOrderAttentionRecord {
  return {
    id: "same",
    orderNo: "MAIN-0001",
    status: "new",
    fulfillmentMethod: "pickup",
    ...overrides,
  };
}

test("new pickup alerts stay isolated to the authenticated organization and branch", () => {
  const rows = normalizeScopedNewOnlinePickupAlerts([
    { id: "same", org_id: "org-a", store_id: "store-a", order_no: "MAIN-0001", status: "new", fulfillment_method: "pickup" },
    { id: "other-org", org_id: "org-b", store_id: "store-a", order_no: "OTHER-0001", status: "new", fulfillment_method: "pickup" },
    { id: "other-branch", org_id: "org-a", store_id: "store-b", order_no: "SECOND-0001", status: "new", fulfillment_method: "pickup" },
    { id: "delivery", org_id: "org-a", store_id: "store-a", order_no: "MAIN-0002", status: "new", fulfillment_method: "delivery" },
    { id: "acknowledged", org_id: "org-a", store_id: "store-a", order_no: "MAIN-0003", status: "confirmed", fulfillment_method: "pickup" },
  ], { orgId: "org-a", storeId: "store-a" });

  assert.deepEqual(rows, [order()]);
});

test("acknowledgment or forward progress removes an order from attention", () => {
  const previous = [order({ id: "order-1" })];
  const acknowledged = [order({ id: "order-1", status: "confirmed" })];
  const preparing = [order({ id: "order-1", status: "preparing" })];

  assert.deepEqual(getUnacknowledgedOnlinePickupOrders(previous).map(({ id }) => id), ["order-1"]);
  assert.deepEqual(getNewOnlinePickupOrderIds([], previous), ["order-1"]);
  assert.deepEqual(getUnacknowledgedOnlinePickupOrders(acknowledged), []);
  assert.deepEqual(getUnacknowledgedOnlinePickupOrders(preparing), []);
  assert.deepEqual(getNewOnlinePickupOrderIds(previous, acknowledged), []);
  assert.deepEqual(getNewOnlinePickupOrderIds(previous, preparing), []);
  assert.match(formatOnlineOrderAttentionMessage(previous), /MAIN-0001/);
});

test("attention cues are rate-limited without suppressing a later order", () => {
  let now = 1_000;
  const allowSignal = createOnlineOrderAttentionRateLimiter(30_000, () => now);

  assert.equal(allowSignal(), true);
  now += 1_000;
  assert.equal(allowSignal(), false);
  now += 29_000;
  assert.equal(allowSignal(), true);
});

test("staff surfaces retain explicit organization and branch predicates and the acknowledgment action", () => {
  const pos = read("src/components/pos/SellScreen.tsx");
  const adminPage = read("src/app/admin/online-ordering/page.tsx");
  const actions = read("src/app/admin/online-ordering/actions.ts");
  const workspace = read("src/app/admin/online-ordering/OnlineOrderingWorkspace.tsx");
  const ordering = read("src/lib/online-ordering.ts");
  const banner = read("src/components/online-ordering/OnlineOrderAlertBanner.tsx");

  assert.match(pos, /\.eq\("org_id", profile\.org_id\)/);
  assert.match(pos, /\.eq\("store_id", profile\.store_id\)/);
  assert.match(adminPage, /\.eq\("org_id", profile\.org_id\)/);
  assert.match(adminPage, /\.eq\("store_id", store\.id\)/);
  assert.match(actions, /\.eq\("org_id", profile\.org_id\)/);
  assert.match(ordering, /label: "Acknowledge order"/);
  assert.match(workspace, /getOnlineOrderNextAction/);
  assert.match(banner, /aria-live="polite"/);
  assert.match(banner, /acknowledged or moved forward/);
});
