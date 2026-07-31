"use client";

/**
 * POS Sell Screen (P1+P2). Catalog grid + cart + weight keypad + discounts +
 * charge flow + park/hold tray. Money is integer centavos (money.ts).
 * Orders are written to the local outbox FIRST (offline.ts), then synced via
 * the idempotent `place_order` RPC — the UI never awaits the network.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPeso, weightLineTotal } from "@/lib/money";
import { SignOutButton } from "@/components/SignOutButton";
import {
  buildOrderNo,
  enqueueOrder,
  flushOutbox,
  loadCachedCatalog,
  pendingCount,
  saveCatalogCache,
  watchPending,
} from "@/lib/offline";

type Product = {
  id: string;
  name: string;
  pricing_mode: "fixed" | "per_kg";
  price: number; // centavos
  unit: string;
  category_id: string | null;
};
type Category = { id: string; name: string; icon: string | null };

type CartLine = {
  key: string; // product id — one line per product
  product: Product;
  qty: number;
  weightKg: number | null; // set for per_kg lines
  lineTotal: number; // centavos
};

type DiscountState = {
  type: "none" | "senior" | "pwd" | "custom";
  pct: number;
  name: string;
  id: string;
};
const NO_DISCOUNT: DiscountState = { type: "none", pct: 0, name: "", id: "" };

type ParkedOrder = {
  at: number;
  lines: CartLine[];
  note: string;
  discount: DiscountState;
};

const PARK_KEY = "pos.parked.v1";
const MAX_PARKED = 10;

const round = (n: number) => Math.round(n);

function branchPrefix(storeName: string | null): string {
  const words = (storeName ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 3);
  return letters || "POS";
}

export default function SellScreen() {
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<{
    id: string;
    org_id: string;
    store_id: string | null;
    store_name: string | null;
  } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState<DiscountState>(NO_DISCOUNT);
  const [discountOpen, setDiscountOpen] = useState(false);

  const [keypad, setKeypad] = useState<{ product: Product; lineKey?: string } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [parked, setParked] = useState<ParkedOrder[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [success, setSuccess] = useState<{ orderNo: string; change: number | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  // ── Catalog: network first, cached fallback (P2) ─────────────────────
  // NOTE: postgrest-js THROWS on network failures (fetch rejects) and only
  // resolves `{error}` for HTTP errors — both must be treated as offline.
  const refreshCatalog = useCallback(async () => {
    let profileData: {
      id: string;
      org_id: string;
      store_id: string | null;
      store_name: string | null;
    } | null = null;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, org_id, store_id, stores(name)")
          .eq("id", session.user.id)
          .single();
        if (prof) {
          profileData = {
            id: prof.id,
            org_id: prof.org_id,
            store_id: prof.store_id,
            store_name: (prof.stores as { name?: string } | null)?.name ?? null,
          };
        }
      }
    } catch {
      /* offline — fall through to the cache */
    }

    // Offline (session refresh or profile fetch failed): serve the cache.
    if (!profileData) {
      const cached = await loadCachedCatalog();
      if (cached) {
        profileData = cached.profile as typeof profileData;
        setProfile(profileData);
        setCategories(cached.categories as Category[]);
        setProducts(cached.products as Product[]);
      }
      setOffline(true);
      setLoading(false);
      return;
    }
    setProfile(profileData);

    try {
      const scope = profileData.store_id
        ? { column: "store_id", value: profileData.store_id }
        : { column: "org_id", value: profileData.org_id };
      const [catRes, prodRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, icon")
          .eq(scope.column, scope.value)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("products")
          .select("id, name, pricing_mode, price, unit, category_id")
          .eq(scope.column, scope.value)
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (catRes.error || prodRes.error) throw catRes.error || prodRes.error;
      setCategories((catRes.data ?? []) as Category[]);
      setProducts((prodRes.data ?? []) as Product[]);
      await saveCatalogCache(prodRes.data ?? [], catRes.data ?? [], profileData);
      setOffline(false);
    } catch {
      const cached = await loadCachedCatalog();
      if (cached) {
        setProfile(cached.profile as typeof profileData);
        setCategories(cached.categories as Category[]);
        setProducts(cached.products as Product[]);
      }
      setOffline(true);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  // ── Offline sync: pending counter, retry with backoff (P2) ───────────
  useEffect(() => watchPending(setPending), []);

  const retryMs = useRef(2000);
  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const synced = await flushOutbox(supabase);
    if (synced > 0) {
      // Network is back — refresh catalog + flip the pill back to Online.
      retryMs.current = 2000;
      void refreshCatalog();
    } else {
      retryMs.current =
        (await pendingCount()) === 0 ? 2000 : Math.min(60000, retryMs.current * 2);
    }
  }, [supabase, refreshCatalog]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      void flush().then(() => {
        timer = setTimeout(tick, retryMs.current);
      });
    };
    tick();
    const onOnline = () => {
      retryMs.current = 2000;
      setOffline(false);
      void refreshCatalog();
      void flush();
    };
    window.addEventListener("online", onOnline);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [flush, refreshCatalog]);

  // ── Park tray persistence ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PARK_KEY);
      if (raw) setParked(JSON.parse(raw));
    } catch {
      /* ignore corrupt tray */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PARK_KEY, JSON.stringify(parked));
    } catch {
      /* storage full/blocked — tray is best-effort */
    }
  }, [parked]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Derived totals (centavos) ─────────────────────────────────────────
  const subtotal = cart.reduce((s, l) => s + l.lineTotal, 0);
  const discountAmount =
    discount.type === "none" ? 0 : round((subtotal * discount.pct) / 100);
  const total = subtotal - discountAmount;

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (activeCat === "all" || p.category_id === activeCat) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
  }, [products, activeCat, search]);

  // ── Cart ops ──────────────────────────────────────────────────────────
  const addFixed = useCallback((product: Product) => {
    setCart((prev) => {
      const hit = prev.find((l) => l.key === product.id);
      if (hit) {
        return prev.map((l) =>
          l.key === product.id
            ? { ...l, qty: l.qty + 1, lineTotal: l.lineTotal + product.price }
            : l,
        );
      }
      return [
        ...prev,
        { key: product.id, product, qty: 1, weightKg: null, lineTotal: product.price },
      ];
    });
  }, []);

  const bump = (key: string, delta: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.key === key && l.product.pricing_mode === "fixed"
          ? {
              ...l,
              qty: Math.max(1, l.qty + delta),
              lineTotal: Math.max(1, l.qty + delta) * l.product.price,
            }
          : l,
      ),
    );
  };

  const applyWeight = (product: Product, kg: number, lineKey?: string) => {
    const lineTotal = weightLineTotal(product.price, kg);
    setCart((prev) => {
      if (lineKey) {
        return prev.map((l) =>
          l.key === lineKey ? { ...l, weightKg: kg, lineTotal } : l,
        );
      }
      const hit = prev.find((l) => l.key === product.id);
      if (hit) return prev.map((l) => (l.key === product.id ? { ...l, weightKg: kg, lineTotal } : l));
      return [
        ...prev,
        { key: product.id, product, qty: 1, weightKg: kg, lineTotal },
      ];
    });
  };

  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  // ── Park / hold ───────────────────────────────────────────────────────
  const holdOrder = () => {
    if (cart.length === 0) return;
    if (parked.length >= MAX_PARKED) {
      setToast(`Hold tray full (${MAX_PARKED}) — resume or clear one first.`);
      return;
    }
    setParked((prev) => [...prev, { at: Date.now(), lines: cart, note, discount }]);
    setCart([]);
    setNote("");
    setDiscount(NO_DISCOUNT);
    setTrayOpen(false);
  };
  const resumeOrder = (i: number) => {
    const p = parked[i];
    setCart(p.lines);
    setNote(p.note);
    setDiscount(p.discount);
    setParked((prev) => prev.filter((_, idx) => idx !== i));
    setTrayOpen(false);
  };

  // ── Order placement: local-first, sync in background (P2) ────────────
  const placeOrder = async (method: string, tendered: number | null, payRef: string) => {
    if (!profile || cart.length === 0) return;
    const now = new Date();
    const orderNo = buildOrderNo(branchPrefix(profile.store_name));
    const isScPwd = discount.type === "senior" || discount.type === "pwd";

    const p_items = cart.map((l) => ({
      product_id: l.product.id,
      name_snapshot: l.product.name,
      pricing_mode_snapshot: l.product.pricing_mode,
      unit_price_snapshot: l.product.price,
      qty: l.qty,
      weight_kg: l.weightKg ?? null,
      line_total: l.lineTotal,
    }));
    const p_order = {
      local_uuid: crypto.randomUUID(),
      org_id: profile.org_id,
      store_id: profile.store_id,
      device_id: "",
      order_no: orderNo,
      cashier_id: profile.id,
      status: "completed",
      subtotal,
      discount_type: discount.type,
      discount_amount: discountAmount,
      discount_ref: isScPwd ? `${discount.name} — ${discount.id}` : null,
      vatable_sale: total, // P1 placeholder: full total; VAT split lands with receipts (P3)
      vat_amount: 0,
      vat_exempt_sale: 0,
      total,
      payment_method: method,
      payment_ref: payRef || null,
      amount_tendered: method === "cash" ? tendered : null,
      change_due: method === "cash" && tendered !== null ? tendered - total : null,
      note: note.trim() || null,
      created_at_device: now.toISOString(),
    };

    try {
      await enqueueOrder(p_order, p_items);
    } catch {
      setToast("Couldn't save order on this device — please try again.");
      return;
    }
    setPayOpen(false);
    setSuccess({
      orderNo,
      change:
        method === "cash" && tendered !== null && tendered - total >= 0
          ? tendered - total
          : null,
    });
    setCart([]);
    setNote("");
    setDiscount(NO_DISCOUNT);
    retryMs.current = 2000; // sync immediately; back off only on failures
    void flush();
  };

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [success]);

  if (loading) {
    return (
      <main className="min-h-full p-6">
        <p className="text-ink-muted">Loading catalog…</p>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <header className="relative flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <div className="mr-auto">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Lechon POS · <span className="text-ink">{profile?.store_name ?? "—"}</span>
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="w-52 rounded-btn border border-line-strong bg-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
        />
        <div
          className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-bold ${
            offline ? "border border-line bg-surface text-ink-muted" : "bg-secondary text-ink"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${offline ? "bg-warning" : "bg-success"}`} />
          {offline ? "Offline" : "Online"}
          {pending > 0 && <span className="tnums">· {pending} pending</span>}
        </div>
        {pending > 0 && (
          <button
            onClick={() => void flush()}
            className="rounded-btn bg-primary px-3 py-1.5 text-xs font-bold text-primary-fg"
          >
            Sync now
          </button>
        )}
        <button
          onClick={() => setTrayOpen((v) => !v)}
          disabled={parked.length === 0}
          className="relative rounded-btn bg-secondary px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-40"
        >
          Hold {parked.length > 0 && <span className="ml-1 rounded-pill bg-accent px-1.5 text-xs text-accent-fg">{parked.length}</span>}
        </button>
        {trayOpen && (
          <div className="absolute right-16 top-12 z-30 w-80 rounded-card border border-line bg-raised p-2 shadow-[var(--shadow-pop)]">
            {parked.length === 0 && <p className="p-3 text-sm text-ink-muted">No parked orders.</p>}
            {parked.map((p, i) => (
              <div key={p.at} className="flex items-center gap-2 rounded-btn p-2 hover:bg-secondary">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {p.lines.length} item{p.lines.length === 1 ? "" : "s"} · {formatPeso(p.lines.reduce((s, l) => s + l.lineTotal, 0))}
                  </p>
                  <p className="text-xs text-ink-muted">{new Date(p.at).toLocaleTimeString()}</p>
                </div>
                <button onClick={() => resumeOrder(i)} className="rounded-btn bg-primary px-3 py-1 text-xs font-bold text-primary-fg">
                  Resume
                </button>
                <button
                  onClick={() => setParked((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded-btn bg-danger-soft px-2 py-1 text-xs font-bold text-danger"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <SignOutButton />
      </header>

      {/* Body: rail · grid · cart */}
      <div className="flex min-h-0 flex-1">
        {/* Category rail (~12%) */}
        <nav className="w-28 shrink-0 overflow-y-auto border-r border-line bg-sidebar p-2">
          <button
            onClick={() => setActiveCat("all")}
            className={`w-full rounded-btn px-2 py-3 text-left text-sm font-semibold ${activeCat === "all" ? "bg-primary text-primary-fg" : "text-ink hover:bg-secondary"}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`mt-1 w-full rounded-btn px-2 py-3 text-left text-sm font-semibold ${activeCat === c.id ? "bg-primary text-primary-fg" : "text-ink hover:bg-secondary"}`}
            >
              <span className="block truncate">{c.name}</span>
            </button>
          ))}
        </nav>

        {/* Product grid */}
        <section className="min-w-0 flex-1 overflow-y-auto p-4">
          {visibleProducts.length === 0 ? (
            <p className="mt-16 text-center text-ink-muted">
              {products.length === 0 ? "No products yet — the menu hasn't been seeded." : `No items in this category.`}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => (p.pricing_mode === "per_kg" ? setKeypad({ product: p }) : addFixed(p))}
                  className="relative min-h-[104px] rounded-card border border-line bg-raised p-3 text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.98]"
                >
                  {p.pricing_mode === "per_kg" && (
                    <span className="absolute right-2 top-2 rounded-pill bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
                      /kg
                    </span>
                  )}
                  <p className="pr-8 text-sm font-bold leading-tight text-ink">{p.name}</p>
                  <p className="tnums mt-2 text-lg font-extrabold text-accent">{formatPeso(p.price)}</p>
                  {p.pricing_mode === "per_kg" && <p className="text-xs text-ink-muted">per kg</p>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Cart panel (~36%) */}
        <aside className="flex w-[36%] min-w-[300px] max-w-md flex-col border-l border-line bg-surface">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <p className="mt-10 text-center text-sm text-ink-muted">
                No items yet — tap a product to start.
              </p>
            ) : (
              <ul className="space-y-2">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center gap-2 rounded-card border border-line bg-raised p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{l.product.name}</p>
                      {l.weightKg !== null ? (
                        <p className="tnums text-xs text-ink-muted">{l.weightKg.toFixed(2)} kg</p>
                      ) : (
                        <p className="tnums text-xs text-ink-muted">×{l.qty}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {l.weightKg !== null ? (
                        <button
                          onClick={() => setKeypad({ product: l.product, lineKey: l.key })}
                          className="rounded-btn bg-secondary px-3 py-1.5 text-sm font-bold text-ink"
                        >
                          Edit
                        </button>
                      ) : (
                        <>
                          <button onClick={() => bump(l.key, -1)} className="h-9 w-9 rounded-btn bg-secondary text-lg font-bold text-ink">
                            −
                          </button>
                          <span className="tnums w-7 text-center text-sm font-bold text-ink">{l.qty}</span>
                          <button onClick={() => bump(l.key, 1)} className="h-9 w-9 rounded-btn bg-secondary text-lg font-bold text-ink">
                            +
                          </button>
                        </>
                      )}
                      <button onClick={() => removeLine(l.key)} className="ml-1 h-9 w-9 rounded-btn text-danger hover:bg-danger-soft">
                        ✕
                      </button>
                    </div>
                    <p className="tnums w-24 text-right text-sm font-extrabold text-ink">{formatPeso(l.lineTotal)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line p-4">
            <div className="flex items-center gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Order note…"
                className="min-w-0 flex-1 rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
              <button
                onClick={() => setDiscountOpen(true)}
                className="rounded-btn bg-secondary px-3 py-2 text-sm font-bold text-ink"
              >
                {discount.type === "none" ? "Discount" : `${discount.type === "custom" ? `${discount.pct}%` : discount.type === "senior" ? "Senior" : "PWD"}`}
              </button>
            </div>

            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between text-ink-muted">
                <span>Subtotal</span>
                <span className="tnums">{formatPeso(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-success">
                  <span>Discount</span>
                  <span className="tnums">−{formatPeso(discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-line pt-2">
                <span className="font-bold text-ink">TOTAL</span>
                <span className="tnums text-2xl font-extrabold text-accent">{formatPeso(total)}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={holdOrder}
                disabled={cart.length === 0 || parked.length >= MAX_PARKED}
                className="rounded-btn bg-secondary py-3 font-bold uppercase text-ink disabled:opacity-40"
              >
                Hold
              </button>
              <button
                onClick={() => setPayOpen(true)}
                disabled={cart.length === 0 || total <= 0}
                className="rounded-btn bg-accent py-3 font-bold uppercase text-accent-fg disabled:opacity-40"
              >
                Charge
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Weight keypad modal */}
      {keypad && (
        <KeypadModal
          product={keypad.product}
          initialKg={cart.find((l) => l.key === keypad.lineKey)?.weightKg ?? null}
          onConfirm={(kg) => {
            applyWeight(keypad.product, kg, keypad.lineKey);
            setKeypad(null);
          }}
          onClose={() => setKeypad(null)}
        />
      )}

      {/* Discount sheet */}
      {discountOpen && (
        <DiscountModal
          value={discount}
          onChange={setDiscount}
          onClose={() => setDiscountOpen(false)}
        />
      )}

      {/* Payment modal */}
      {payOpen && (
        <ChargeModal
          total={total}
          onConfirm={placeOrder}
          onClose={() => setPayOpen(false)}
        />
      )}

      {/* Success overlay */}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95">
          <div className="text-center">
            <p className="text-4xl font-extrabold text-success">✓ Order saved</p>
            <p className="tnums mt-2 text-lg font-semibold text-ink">{success.orderNo}</p>
            <p className="mt-1 text-sm text-ink-muted">Saved on this device · syncs automatically</p>
            {success.change !== null && (
              <p className="tnums mt-4 text-6xl font-extrabold text-success">
                {formatPeso(success.change)}
              </p>
            )}
            {success.change !== null && <p className="mt-1 text-ink-muted">Change due</p>}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-ink px-4 py-2 text-sm font-semibold text-bg shadow-[var(--shadow-pop)]">
          {toast}
        </div>
      )}
    </main>
  );
}

/* ── Weight keypad ─────────────────────────────────────────────────────── */
function KeypadModal({
  product,
  initialKg,
  onConfirm,
  onClose,
}: {
  product: Product;
  initialKg: number | null;
  onConfirm: (kg: number) => void;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState(
    initialKg !== null ? String(Math.round(initialKg * 100)) : "0",
  );
  // Digits are integer centikilos ("135" = 1.35 kg) UNLESS the user typed a
  // decimal point, in which case the string is already in kg ("1.35").
  const kg = digits.includes(".") ? Number(digits) : Number(digits) / 100;
  const lineTotal = weightLineTotal(product.price, kg);

  const press = (k: string) => {
    setDigits((d) => {
      if (k === "⌫") return d.length > 1 ? d.slice(0, -1) : "0";
      if (k === ".") return d.includes(".") ? d : d === "0" ? "0." : d + ".";
      const next = d === "0" && k !== "." ? k : d + k;
      if (next.replace(".", "").length > 5) return d; // max 999.99 kg
      return next;
    });
  };

  const display = kg === 0 ? "0.00" : kg.toFixed(2);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-card bg-raised p-4 shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-sm font-bold text-ink">{product.name}</p>
        <p className="tnums mt-1 text-center text-xs text-ink-muted">{formatPeso(product.price)} / kg</p>
        <p className="tnums mt-3 text-center text-5xl font-extrabold text-ink">{display}</p>
        <p className="tnums mt-1 text-center text-lg font-bold text-accent">{formatPeso(lineTotal)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-14 rounded-btn bg-secondary text-xl font-bold text-ink active:scale-95"
            >
              {k}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="rounded-btn bg-secondary py-3 font-bold text-ink">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(kg)}
            disabled={kg <= 0}
            className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Discount sheet ────────────────────────────────────────────────────── */
function DiscountModal({
  value,
  onChange,
  onClose,
}: {
  value: DiscountState;
  onChange: (d: DiscountState) => void;
  onClose: () => void;
}) {
  const [selType, setSelType] = useState(value.type);
  const [name, setName] = useState(value.name);
  const [id, setId] = useState(value.id);
  const [pct, setPct] = useState(value.pct > 0 ? String(value.pct) : "");
  const isScPwd = selType === "senior" || selType === "pwd";

  const commit = () => {
    if (isScPwd && (!name.trim() || !id.trim())) return;
    onChange({
      type: selType,
      pct: selType === "custom" ? Math.min(100, Math.max(0, Number(pct) || 0)) : selType === "senior" || selType === "pwd" ? 20 : 0,
      name: name.trim(),
      id: id.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-card bg-raised p-4 shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">Discount</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ["none", "None"],
              ["senior", "Senior"],
              ["pwd", "PWD"],
              ["custom", "Custom %"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setSelType(t)}
              className={`rounded-btn py-3 text-sm font-bold ${selType === t ? "bg-primary text-primary-fg" : "bg-secondary text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {isScPwd && (
          <div className="mt-3 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name (required)"
              className="w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="ID / OSCA number (required)"
              className="w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <p className="text-xs text-ink-muted">Applies 20% discount.</p>
          </div>
        )}

        {selType === "custom" && (
          <div className="mt-3">
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              inputMode="decimal"
              placeholder="Percent (0–100)"
              className="w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-ink-muted">Admin-PIN threshold comes with backoffice settings (P6).</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => { onChange(NO_DISCOUNT); onClose(); }} className="rounded-btn bg-secondary py-3 font-bold text-ink">
            Remove
          </button>
          <button
            onClick={commit}
            disabled={isScPwd && (!name.trim() || !id.trim())}
            className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Payment / charge modal ────────────────────────────────────────────── */
function ChargeModal({
  total,
  onConfirm,
  onClose,
}: {
  total: number;
  onConfirm: (method: string, tendered: number | null, payRef: string) => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<"cash" | "gcash" | "maya" | "card">("cash");
  const [tendered, setTendered] = useState("");
  const [ref, setRef] = useState("");

  const tenderedPesos = Number(tendered) || 0;
  const tenderedCents = round(tenderedPesos * 100);
  const change = tenderedCents - total;
  const cashOk = method !== "cash" || (tenderedCents >= total && tenderedPesos > 0);
  const refOk = method === "cash" || (method === "card" ? /^\d{4}$/.test(ref) : ref.trim().length >= 4);
  const canConfirm = cashOk && refOk;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-card bg-raised p-4 shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">Charge</p>
        <p className="tnums mt-1 text-3xl font-extrabold text-accent">{formatPeso(total)}</p>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {(["cash", "gcash", "maya", "card"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-btn py-2 text-sm font-bold capitalize ${method === m ? "bg-primary text-primary-fg" : "bg-secondary text-ink"}`}
            >
              {m}
            </button>
          ))}
        </div>

        {method === "cash" ? (
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                ["Exact", String(total / 100)],
                ["₱500", "500"],
                ["₱1000", "1000"],
              ].map(([label, v]) => (
                <button
                  key={label}
                  onClick={() => setTendered(v)}
                  className="rounded-pill bg-secondary px-3 py-1.5 text-sm font-bold text-ink"
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              inputMode="decimal"
              placeholder="Amount tendered"
              className="tnums mt-2 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-right text-xl font-bold text-ink outline-none focus:border-primary"
            />
            <p className={`tnums mt-2 text-right text-2xl font-extrabold ${change >= 0 ? "text-success" : "text-warning"}`}>
              {change >= 0 ? formatPeso(change) : "Insufficient"}
            </p>
            {change >= 0 && <p className="text-right text-xs text-ink-muted">Change due</p>}
          </div>
        ) : (
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={method === "card" ? "Card last 4 digits" : "Reference number"}
            inputMode={method === "card" ? "numeric" : "text"}
            className="tnums mt-3 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          />
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="rounded-btn bg-secondary py-3 font-bold text-ink">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(method, method === "cash" ? tenderedCents : null, ref.trim())}
            disabled={!canConfirm}
            className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
