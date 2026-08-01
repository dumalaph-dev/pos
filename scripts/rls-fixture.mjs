#!/usr/bin/env node
/**
 * RLS tenant-isolation fixture + assertions (TEST_PLAN §1).
 *
 * Prereqs:
 *   - Local Supabase running with seed.sql applied (supabase start / db reset)
 *   - .env.local pointing at the local stack (URL + anon + service_role keys)
 *
 * Run:
 *   node scripts/rls-fixture.mjs
 *
 * Creates (idempotently): 2 orgs x {1 org-wide admin + 2 branch cashiers},
 * matching the RLS model (admins are org-wide; cashiers are per-store).
 * Then signs in as each user and asserts the §1 isolation matrix using the
 * REST API with that user's JWT — never the service role for reads/writes
 * under test (service role bypasses RLS).
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* fall back to process.env */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

// Fixed ids from supabase/seed.sql.
const ORG_A = "a0000000-0000-0000-0000-000000000001";
const ORG_B = "a0000000-0000-0000-0000-000000000002";
const STORE_A1 = "a0000000-0000-0000-0000-000000000011";
const STORE_A2 = "a0000000-0000-0000-0000-000000000012";
const STORE_B1 = "a0000000-0000-0000-0000-000000000013";
const STORE_B2 = "a0000000-0000-0000-0000-000000000014";

const PASSWORD = process.env.FIXTURE_PASSWORD ?? "fixture123";

const FIXTURE_USERS = [
  { email: "admin-a@fixture.test", org: ORG_A, store: null, role: "admin", name: "Alpha Admin" },
  { email: "cashier-a1@fixture.test", org: ORG_A, store: STORE_A1, role: "cashier", name: "Alpha Cashier 1" },
  { email: "cashier-a2@fixture.test", org: ORG_A, store: STORE_A2, role: "cashier", name: "Alpha Cashier 2" },
  { email: "admin-b@fixture.test", org: ORG_B, store: null, role: "admin", name: "Beta Admin" },
  { email: "cashier-b1@fixture.test", org: ORG_B, store: STORE_B1, role: "cashier", name: "Beta Cashier 1" },
  { email: "cashier-b2@fixture.test", org: ORG_B, store: STORE_B2, role: "cashier", name: "Beta Cashier 2" },
];

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
async function expectError(name, fn) {
  let res;
  try {
    res = await fn();
  } catch (e) {
    // Some clients (e.g. auth) throw on HTTP errors; postgrest-js resolves.
    check(name, true, `${e.name ?? "error"}: ${String(e.message ?? e).slice(0, 110)}`);
    return;
  }
  if (res?.error) {
    check(name, true, `${res.error.code ?? "err"}: ${String(res.error.message ?? res.error).slice(0, 110)}`);
  } else {
    check(name, false, "expected an error but none was raised");
  }
}

const svc = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser(u) {
  const { data, error } = await svc.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error && !/already.*registered/i.test(error.message)) throw error;
  if (data?.user?.id) return data.user.id;
  const { data: list } = await svc.auth.admin.listUsers();
  const existing = list.users.find((x) => x.email === u.email);
  if (!existing) throw new Error(`could not resolve auth user ${u.email}`);
  return existing.id;
}

async function clientFor(email) {
  const c = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

async function main() {
  console.log("── Fixture users + profiles ──");
  const users = [];
  for (const u of FIXTURE_USERS) {
    const id = await ensureUser(u);
    const { error: profErr } = await svc.from("profiles").upsert(
      { id, org_id: u.org, store_id: u.store, full_name: u.name, role: u.role },
      { onConflict: "id" }
    );
    if (profErr) throw profErr;
    users.push({ ...u, id });
    console.log(`  ✓ ${u.email} (${u.role})`);
  }
  const adminA = users.find((u) => u.role === "admin" && u.org === ORG_A);
  const adminB = users.find((u) => u.role === "admin" && u.org === ORG_B);
  const cashierA1 = users.find((u) => u.email === "cashier-a1@fixture.test");
  const cashierA2 = users.find((u) => u.email === "cashier-a2@fixture.test");
  await svc.from("organizations").update({ owner_profile_id: adminA.id }).eq("id", ORG_A);
  await svc.from("organizations").update({ owner_profile_id: adminB.id }).eq("id", ORG_B);

  console.log("── Signing in as fixture users ──");
  const as = {
    adminA: await clientFor(adminA.email),
    adminB: await clientFor(adminB.email),
    cashierA1: await clientFor(cashierA1.email),
    cashierA2: await clientFor(cashierA2.email),
    cashierB1: await clientFor("cashier-b1@fixture.test"),
  };
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("── TEST_PLAN §1 assertions ──");

  // 1.1 Cross-org read denied (0 rows on the other org's data).
  const { data: orgBviaAdminA, error: err11a } = await as.adminA
    .from("products").select("id").eq("org_id", ORG_B);
  check("1.1 Org A admin reads Org B products", !err11a && orgBviaAdminA.length === 0,
    err11a?.message ?? `${orgBviaAdminA.length} rows leaked`);
  const { data: orgBviaCashier, error: err11b } = await as.cashierA1
    .from("products").select("id").eq("org_id", ORG_B);
  check("1.1 Org A cashier reads Org B products", !err11b && orgBviaCashier.length === 0,
    err11b?.message ?? `${orgBviaCashier.length} rows leaked`);

  // 1.2 Branch isolation within the same org.
  const { data: a2viaA1, error: err12 } = await as.cashierA1
    .from("products").select("id").eq("store_id", STORE_A2);
  check("1.2 Branch A1 cashier reads Branch A2 products", !err12 && a2viaA1.length === 0,
    err12?.message ?? `${a2viaA1.length} rows leaked`);

  // 1.3 Cashier cannot UPDATE/DELETE orders (append-only; no grant either).
  await expectError("1.3 Cashier UPDATE orders rejected", () =>
    as.cashierA1.from("orders").update({ note: "tampered" }).eq("store_id", STORE_A1));
  await expectError("1.3 Cashier DELETE orders rejected", () =>
    as.cashierA1.from("orders").delete().eq("store_id", STORE_A1));
  await expectError("1.3 Admin UPDATE orders rejected (no UPDATE grant for authenticated)", () =>
    as.adminA.from("orders").update({ note: "tampered" }).eq("store_id", STORE_A1));

  // 1.4 Append-only audit_logs / stock_movements — no UPDATE/DELETE for anyone.
  await expectError("1.4 Admin UPDATE audit_logs rejected", () =>
    as.adminA.from("audit_logs").update({ action: "forged" }).eq("org_id", ORG_A));
  await expectError("1.4 Cashier UPDATE stock_movements rejected", () =>
    as.cashierA1.from("stock_movements").update({ reason: "forged" }).eq("store_id", STORE_A1));
  await expectError("1.4 Cashier DELETE stock_movements rejected", () =>
    as.cashierA1.from("stock_movements").delete().eq("store_id", STORE_A1));
  // Defense in depth: even service_role (which bypasses RLS) is blocked by the trigger.
  const { data: auditRow, error: auditInsErr } = await svc
    .from("audit_logs").insert({ org_id: ORG_A, store_id: STORE_A1, actor_id: adminA.id, action: "fixture" }).select().single();
  check("1.4 service_role can insert audit_logs (setup)", !auditInsErr, auditInsErr?.message);
  if (auditRow) {
    await expectError("1.4 service_role UPDATE audit_logs blocked by trigger", () =>
      svc.from("audit_logs").update({ action: "forged" }).eq("id", auditRow.id));
  }

  // 1.5 Positive control: cashier inserts a valid order into own store.
  const orderNo = `A1-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-0001`;
  const { error: okErr } = await as.cashierA1
    .from("orders").insert({
      local_uuid: randomUUID(),
      org_id: ORG_A,
      store_id: STORE_A1,
      order_no: orderNo,
      cashier_id: cashierA1.id,
      subtotal: 280000,
      total: 280000,
      payment_method: "cash",
      amount_tendered: 300000,
      change_due: 20000,
      created_at_device: new Date().toISOString(),
    }).select().single();
  check("1.5 Cashier inserts order into own branch (positive control)", !okErr, okErr?.message);

  // 1.5 Mismatched store_id → with-check violation.
  await expectError("1.5 Cashier inserts order with other branch's store_id", () =>
    as.cashierA1.from("orders").insert({
      local_uuid: randomUUID(),
      org_id: ORG_A,
      store_id: STORE_A2,
      order_no: `A2-${Date.now()}`,
      cashier_id: cashierA1.id,
      subtotal: 100,
      total: 100,
      payment_method: "cash",
      created_at_device: new Date().toISOString(),
    }));
  // 1.5 Mismatched cashier_id → with-check violation.
  await expectError("1.5 Cashier inserts order as another cashier", () =>
    as.cashierA1.from("orders").insert({
      local_uuid: randomUUID(),
      org_id: ORG_A,
      store_id: STORE_A1,
      order_no: `A1-${Date.now()}-x`,
      cashier_id: cashierA2.id,
      subtotal: 100,
      total: 100,
      payment_method: "cash",
      created_at_device: new Date().toISOString(),
    }));

  // 1.6 Price edit on Branch A1 doesn't touch Branch A2.
  const { error: priceErr } = await as.adminA
    .from("products").update({ price: 295000 })
    .eq("store_id", STORE_A1).eq("name", "Whole Lechon");
  check("1.6 Admin edits A1 price", !priceErr, priceErr?.message);
  const { data: a2whole, error: a2err } = await as.adminA
    .from("products").select("price").eq("store_id", STORE_A2).eq("name", "Whole Lechon").single();
  check("1.6 A2 price unchanged after A1 edit", !a2err && a2whole?.price === 290000,
    a2err?.message ?? `expected 290000, got ${a2whole?.price}`);

  // 1.7 Admin "all branches" query returns only own org's branches.
  const { data: adminAStores, error: err17 } = await as.adminA.from("stores").select("id, org_id");
  check("1.7 Admin A sees only Org A branches",
    !err17 && adminAStores.length === 2 && adminAStores.every((s) => s.org_id === ORG_A),
    err17?.message ?? JSON.stringify(adminAStores));

  // Extra: anon gets no data at all.
  await expectError("Extra Anon read of products rejected", () =>
    anon.from("products").select("id"));

  console.log("── Summary ──");
  console.log(`  ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fixture failed:", e.message ?? e);
  process.exit(1);
});
