"use client";

import { AdminIcon } from "@/components/admin/AdminIcon";
import { updateOnlineAvailability } from "./actions";

type AvailabilityCategory = {
  id: string;
  name: string;
  onlineAvailable: boolean;
};

type AvailabilityProduct = {
  id: string;
  name: string;
  categoryId: string | null;
  onlineAvailable: boolean;
  trackStock: boolean;
};

export function OnlineAvailabilityEditor({
  storeId,
  categories,
  products,
  canManage,
}: {
  storeId: string;
  categories: AvailabilityCategory[];
  products: AvailabilityProduct[];
  canManage: boolean;
}) {
  const productsByCategory = new Map<string, AvailabilityProduct[]>();
  const uncategorized: AvailabilityProduct[] = [];
  for (const product of products) {
    if (!product.categoryId) {
      uncategorized.push(product);
      continue;
    }
    const group = productsByCategory.get(product.categoryId) ?? [];
    group.push(product);
    productsByCategory.set(product.categoryId, group);
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[24px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="online-availability-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Live menu controls</p>
            <h2 id="online-availability-heading" className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-ink">Pause only what needs attention.</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Stock-controlled items are marked sold out automatically. Pause a product or a whole category when the kitchen needs a manual break.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-[10px] font-extrabold text-primary"><AdminIcon name="refresh" size={12} />Live availability</span>
        </div>
      </div>

      {!canManage ? (
        <p className="m-5 rounded-2xl border border-line bg-raised px-4 py-3 text-sm leading-6 text-ink-muted sm:m-6">Ask an owner or manager to change product availability.</p>
      ) : categories.length === 0 && uncategorized.length === 0 ? (
        <p className="m-5 rounded-2xl border border-line bg-raised px-4 py-3 text-sm leading-6 text-ink-muted sm:m-6">Add active products and categories to control their online availability here.</p>
      ) : (
        <div className="grid gap-3 p-4 sm:p-6">
          {categories.map((category) => (
            <div key={category.id} className="rounded-2xl border border-line bg-raised p-3.5 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><strong className="text-sm font-extrabold text-ink">{category.name}</strong><AvailabilityBadge available={category.onlineAvailable} /></div>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">{category.onlineAvailable ? "Products in this section can appear online." : "This entire section is hidden from the public menu."}</p>
                </div>
                <AvailabilityForm storeId={storeId} scope="category" entityId={category.id} available={category.onlineAvailable} label={category.onlineAvailable ? "Pause category" : "Resume category"} />
              </div>
              <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
                {(productsByCategory.get(category.id) ?? []).length === 0 ? (
                  <p className="px-3.5 py-3 text-xs text-ink-muted">No active products in this category.</p>
                ) : (productsByCategory.get(category.id) ?? []).map((product) => <ProductAvailabilityRow key={product.id} storeId={storeId} product={product} categoryAvailable={category.onlineAvailable} />)}
              </div>
            </div>
          ))}

          {uncategorized.length > 0 && (
            <div className="rounded-2xl border border-line bg-raised p-3.5 sm:p-4">
              <div className="flex items-center gap-2"><strong className="text-sm font-extrabold text-ink">Other products</strong><span className="rounded-full bg-raised px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-ink-muted">No category</span></div>
              <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
                {uncategorized.map((product) => <ProductAvailabilityRow key={product.id} storeId={storeId} product={product} categoryAvailable />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProductAvailabilityRow({ storeId, product, categoryAvailable }: { storeId: string; product: AvailabilityProduct; categoryAvailable: boolean }) {
  const effectiveAvailable = product.onlineAvailable && categoryAvailable;
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm font-bold text-ink">{product.name}</strong><AvailabilityBadge available={effectiveAvailable} /><span className="rounded-full bg-raised px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-ink-muted">{product.trackStock ? "Auto sold out" : "Manual availability"}</span></div>
        <p className="mt-1 text-[11px] leading-4 text-ink-muted">{!categoryAvailable ? "Hidden because its category is paused." : product.onlineAvailable ? product.trackStock ? "Inventory controls the customer-facing availability." : "Available until a manager pauses it." : "This product is paused from the public menu."}</p>
      </div>
      <AvailabilityForm storeId={storeId} scope="product" entityId={product.id} available={product.onlineAvailable} label={product.onlineAvailable ? "Pause" : "Resume"} />
    </div>
  );
}

function AvailabilityForm({ storeId, scope, entityId, available, label }: { storeId: string; scope: "product" | "category"; entityId: string; available: boolean; label: string }) {
  return (
    <form action={updateOnlineAvailability} className="shrink-0">
      <input type="hidden" name="store_id" value={storeId} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="available" value={String(!available)} />
      <button type="submit" className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${available ? "border border-danger/25 bg-danger-soft text-danger hover:bg-danger/15" : "bg-primary text-primary-fg hover:bg-primary-hover"}`}><AdminIcon name={available ? "pause" : "check"} size={12} />{label}</button>
    </form>
  );
}

function AvailabilityBadge({ available }: { available: boolean }) {
  return <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide ${available ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}`}>{available ? "Live" : "Paused"}</span>;
}
