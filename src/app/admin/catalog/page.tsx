import { redirect } from "next/navigation";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { createCategory, createProduct, updateCategory, updateProduct } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";
type PricingMode = "fixed" | "per_kg";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  organizations: { name?: string } | null;
};

type BranchRecord = {
  id: string;
  name: string;
  is_active: boolean;
};

type CategoryRecord = {
  id: string;
  store_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

type ProductRecord = {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  pricing_mode: PricingMode;
  price: number;
  unit: string;
  track_stock: boolean;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id, organizations!profiles_org_id_fkey(name)")
    .eq("id", user.id)
    .single();
  const profile = profileData as ProfileRecord | null;

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <CatalogProfileMissing />;

  const [branchesResult, categoriesResult, productsResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, is_active")
      .eq("org_id", profile.org_id)
      .order("name"),
    supabase
      .from("categories")
      .select("id, store_id, name, icon, sort_order, is_active")
      .eq("org_id", profile.org_id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("products")
      .select("id, store_id, category_id, name, pricing_mode, price, unit, track_stock, image_url, is_active, sort_order")
      .eq("org_id", profile.org_id)
      .order("sort_order")
      .order("name")
      .limit(1000),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const categories = (categoriesResult.data ?? []) as CategoryRecord[];
  const products = (productsResult.data ?? []) as ProductRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const queryWarning = Boolean(branchesResult.error || categoriesResult.error || productsResult.error);
  const canWrite = profile.role === "admin";
  const defaultBranch = profile.store_id ?? branches[0]?.id ?? "";
  const currentBranchName = profile.store_id
    ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME
    : "All branches";
  const orgName = profile.organizations?.name ?? DEFAULT_STORE_NAME;
  const activeProducts = products.filter((product) => product.is_active).length;
  const trackedProducts = products.filter((product) => product.track_stock).length;
  const activeCategories = categories.filter((category) => category.is_active).length;

  return (
    <main className="admin-page text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} active="catalog" />

        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-lg text-primary" aria-label="Back to admin overview">â†</Link>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p>
                <h1 className="truncate text-lg font-extrabold text-primary">Products &amp; categories</h1>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/admin/inventory" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Inventory</Link>
              <Link href="/pos" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Open POS</Link>
              <SignOutButton className="px-3 py-2 text-xs" />
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Catalog workspace Â· {currentBranchName}</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Keep the menu ready to sell.</h2>
              <p className="mt-2 max-w-2xl text-sm text-ink-muted">Maintain branch-specific prices, categories, and stock tracking for {orgName}. Changes appear in the POS catalog after its next refresh.</p>
            </div>
            <span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>
              {canWrite ? "Admin editing enabled" : "Manager view only"}
            </span>
          </div>

          {params.error && (
            <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{params.error}</div>
          )}
          {params.saved && (
            <div role="status" className="mt-5 rounded-card border border-success/20 bg-success/10 px-4 py-3 text-sm font-semibold text-success">
              {params.saved === "category" ? "Category saved. Your POS category rail will use it on the next catalog refresh." : "Product saved. The POS will use the updated catalog on its next refresh."}
            </div>
          )}
          {queryWarning && (
            <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some catalog data could not refresh. The page is showing the data that was available.</div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CatalogMetric label="Products" value={String(products.length)} detail={`${activeProducts} active in POS`} tone="bg-accent text-accent-fg" />
            <CatalogMetric label="Categories" value={String(categories.length)} detail={`${activeCategories} visible in POS`} tone="bg-primary text-primary-fg" />
            <CatalogMetric label="Stock tracked" value={String(trackedProducts)} detail="Connected to inventory" tone="bg-secondary text-primary" />
            <CatalogMetric label="Branches" value={String(branches.length)} detail="Branch-specific catalog" tone="bg-primary-soft text-primary" />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)]">
            <section aria-labelledby="new-product-heading" className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Catalog entry</p>
                  <h2 id="new-product-heading" className="mt-1 text-xl font-extrabold text-ink">Add a product</h2>
                </div>
                <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">POS-ready</span>
              </div>
              <form action={createProduct} className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CatalogField label="Branch" htmlFor="new-product-store">
                    <select id="new-product-store" name="store_id" defaultValue={defaultBranch} required disabled={!canWrite || branches.length === 0} className="inventory-input">
                      <option value="">Choose branch</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}
                    </select>
                  </CatalogField>
                  <CatalogField label="Category" htmlFor="new-product-category">
                    <select id="new-product-category" name="category_id" defaultValue="" disabled={!canWrite} className="inventory-input">
                      <option value="">Uncategorized</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{branchById.get(category.store_id)?.name ?? "Branch"} Â· {category.name}</option>)}
                    </select>
                  </CatalogField>
                  <CatalogField label="Product name" htmlFor="new-product-name" className="sm:col-span-2">
                    <input id="new-product-name" name="name" placeholder="e.g. Whole Lechon (Medium)" required disabled={!canWrite} className="inventory-input" />
                  </CatalogField>
                  <CatalogField label="Pricing" htmlFor="new-product-pricing">
                    <select id="new-product-pricing" name="pricing_mode" defaultValue="fixed" required disabled={!canWrite} className="inventory-input">
                      <option value="fixed">Fixed price</option>
                      <option value="per_kg">Price per kilogram</option>
                    </select>
                  </CatalogField>
                  <CatalogField label="Price Â· â‚±" htmlFor="new-product-price">
                    <input id="new-product-price" name="price" type="number" inputMode="decimal" min="0" step="0.01" placeholder="6500.00" required disabled={!canWrite} className="inventory-input tnums" />
                  </CatalogField>
                  <CatalogField label="Unit" htmlFor="new-product-unit">
                    <input id="new-product-unit" name="unit" placeholder="pcs, tray, cup, kg" required disabled={!canWrite} className="inventory-input" />
                  </CatalogField>
                  <CatalogField label="Sort order" htmlFor="new-product-sort">
                    <input id="new-product-sort" name="sort_order" type="number" min="0" step="1" defaultValue="0" disabled={!canWrite} className="inventory-input tnums" />
                  </CatalogField>
                  <CatalogField label="Local image path" htmlFor="new-product-image" className="sm:col-span-2">
                    <input id="new-product-image" name="image_url" placeholder="/food/whole-lechon-medium.png" disabled={!canWrite} className="inventory-input" />
                  </CatalogField>
                </div>
                <div className="flex flex-wrap gap-4 rounded-btn border border-line bg-surface-raised px-3 py-3 text-xs font-bold text-ink-muted">
                  <label className="flex items-center gap-2"><input type="checkbox" name="track_stock" disabled={!canWrite} className="h-4 w-4 accent-primary" /> Track stock in inventory</label>
                </div>
                <button type="submit" disabled={!canWrite || branches.length === 0} className="w-full rounded-btn bg-accent px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">Create product</button>
              </form>
            </section>

            <section aria-labelledby="category-heading" className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Menu structure</p>
                  <h2 id="category-heading" className="mt-1 text-xl font-extrabold text-ink">Categories</h2>
                </div>
                <span className="rounded-pill bg-secondary px-3 py-1.5 text-xs font-extrabold text-primary">Branch-specific</span>
              </div>
              <form action={createCategory} className="mt-5 space-y-3">
                <CatalogField label="Branch" htmlFor="new-category-store">
                  <select id="new-category-store" name="store_id" defaultValue={defaultBranch} required disabled={!canWrite || branches.length === 0} className="inventory-input">
                    <option value="">Choose branch</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </CatalogField>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_86px]">
                  <CatalogField label="Name" htmlFor="new-category-name">
                    <input id="new-category-name" name="name" placeholder="Lechon" required disabled={!canWrite} className="inventory-input" />
                  </CatalogField>
                  <CatalogField label="Icon" htmlFor="new-category-icon">
                    <input id="new-category-icon" name="icon" placeholder="🐷" disabled={!canWrite} className="inventory-input text-center" />
                  </CatalogField>
                </div>
                <CatalogField label="Sort order" htmlFor="new-category-sort">
                  <input id="new-category-sort" name="sort_order" type="number" min="0" step="1" defaultValue="0" disabled={!canWrite} className="inventory-input tnums" />
                </CatalogField>
                <button type="submit" disabled={!canWrite || branches.length === 0} className="w-full rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Create category</button>
              </form>

              <div className="mt-6 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-ink-muted">Existing categories</p>
                  <span className="text-xs font-bold text-ink-muted">{categories.length}</span>
                </div>
                <div className="mt-3 max-h-[390px] space-y-2 overflow-y-auto pr-1">
                  {categories.length === 0 ? (
                    <EmptyState title="No categories yet" detail="Create a category to organize the POS rail." />
                  ) : categories.map((category) => (
                    <CategoryEditor key={category.id} category={category} branchName={branchById.get(category.store_id)?.name ?? "Unknown branch"} canWrite={canWrite} />
                  ))}
                </div>
              </div>
            </section>
          </div>

          <section aria-labelledby="products-heading" className="mt-4 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Menu management</p>
                <h2 id="products-heading" className="mt-1 text-xl font-extrabold text-ink">Products on file</h2>
              </div>
              <span className="rounded-pill border border-line bg-surface-raised px-3 py-1.5 text-xs font-bold text-ink-muted">Edit and save per row</span>
            </div>
            {products.length === 0 ? (
              <EmptyState title="Your catalog is empty" detail="Add the first product above, then open the POS to see it in the menu." />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">
                      <th className="px-2 py-3">Product</th>
                      <th className="px-2 py-3">Branch</th>
                      <th className="px-2 py-3">Category</th>
                      <th className="px-2 py-3">Price / unit</th>
                      <th className="px-2 py-3">Visibility</th>
                      <th className="px-2 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <ProductEditor
                        key={product.id}
                        product={product}
                        branches={branches}
                        categories={categories}
                        categoryById={categoryById}
                        canWrite={canWrite}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function CatalogMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <article className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-transform duration-150 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-ink-muted">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-btn text-sm font-extrabold ${tone}`} aria-hidden="true">â–¦</span>
      </div>
      <p className="tnums mt-5 text-2xl font-extrabold tracking-[-0.04em] text-ink">{value}</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{detail}</p>
    </article>
  );
}

function CatalogField({ label, htmlFor, children, className = "" }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function CategoryEditor({ category, branchName, canWrite }: { category: CategoryRecord; branchName: string; canWrite: boolean }) {
  return (
    <form action={updateCategory} className="rounded-btn border border-line bg-surface-raised p-3">
      <input type="hidden" name="category_id" value={category.id} />
      <input type="hidden" name="store_id" value={category.store_id} />
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-primary-soft text-lg text-primary" aria-hidden="true">{category.icon || "•"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <strong className="truncate text-sm font-extrabold text-ink">{category.name}</strong>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-ink-muted">{branchName}</span>
          </div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_52px] gap-2">
            <input name="name" aria-label={`Name for ${category.name}`} defaultValue={category.name} disabled={!canWrite} className="inventory-input min-h-10 text-xs" />
            <input name="sort_order" aria-label={`Sort order for ${category.name}`} type="number" min="0" step="1" defaultValue={category.sort_order} disabled={!canWrite} className="inventory-input min-h-10 text-center text-xs tnums" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input name="icon" aria-label={`Icon for ${category.name}`} defaultValue={category.icon ?? ""} placeholder="Icon" disabled={!canWrite} className="inventory-input min-h-10 w-20 text-center text-xs" />
            <label className="flex items-center gap-2 text-xs font-bold text-ink-muted"><input type="checkbox" name="is_active" defaultChecked={category.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" /> Visible</label>
            <button type="submit" disabled={!canWrite} className="ml-auto rounded-btn bg-secondary px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50">Save</button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ProductEditor({
  product,
  branches,
  categories,
  categoryById,
  canWrite,
}: {
  product: ProductRecord;
  branches: BranchRecord[];
  categories: CategoryRecord[];
  categoryById: Map<string, CategoryRecord>;
  canWrite: boolean;
}) {
  const formId = `product-form-${product.id}`;
  const branchName = branches.find((branch) => branch.id === product.store_id)?.name ?? "Unknown branch";
  const categoryName = product.category_id ? categoryById.get(product.category_id)?.name ?? "Unknown category" : "Uncategorized";

  return (
    <tr className="border-b border-line/70 align-top last:border-0">
      <td className="px-2 py-3">
        <form id={formId} action={updateProduct}>
          <input type="hidden" name="product_id" value={product.id} />
        </form>
        <input name="name" form={formId} aria-label={`Name for ${product.name}`} defaultValue={product.name} disabled={!canWrite} className="inventory-input min-h-10 min-w-[190px] text-xs font-extrabold" />
        <input name="image_url" form={formId} aria-label={`Image path for ${product.name}`} defaultValue={product.image_url ?? ""} placeholder="/food/...png" disabled={!canWrite} className="inventory-input mt-2 min-h-9 min-w-[190px] text-[11px]" />
      </td>
      <td className="px-2 py-3">
        <select name="store_id" form={formId} aria-label={`Branch for ${product.name}`} defaultValue={product.store_id} disabled={!canWrite} className="inventory-input min-h-10 min-w-[150px] text-xs">
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <span className="mt-2 block text-[10px] font-bold text-ink-muted">Current: {branchName}</span>
      </td>
      <td className="px-2 py-3">
        <select name="category_id" form={formId} aria-label={`Category for ${product.name}`} defaultValue={product.category_id ?? ""} disabled={!canWrite} className="inventory-input min-h-10 min-w-[170px] text-xs">
          <option value="">Uncategorized</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name} Â· {branches.find((branch) => branch.id === category.store_id)?.name ?? "Branch"}</option>)}
        </select>
        <span className="mt-2 block text-[10px] font-bold text-ink-muted">Current: {categoryName}</span>
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          <input name="price" form={formId} aria-label={`Price for ${product.name}`} type="number" min="0" step="0.01" defaultValue={(Number(product.price) / 100).toFixed(2)} disabled={!canWrite} className="inventory-input min-h-10 w-28 text-right text-xs tnums" />
          <select name="pricing_mode" form={formId} aria-label={`Pricing mode for ${product.name}`} defaultValue={product.pricing_mode} disabled={!canWrite} className="inventory-input min-h-10 w-24 text-xs">
            <option value="fixed">Fixed</option>
            <option value="per_kg">/ kg</option>
          </select>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input name="unit" form={formId} aria-label={`Unit for ${product.name}`} defaultValue={product.unit} disabled={!canWrite} className="inventory-input min-h-9 w-28 text-xs" />
          <span className="text-[10px] font-bold text-ink-muted">{formatPeso(Number(product.price))}</span>
        </div>
        <input name="sort_order" form={formId} aria-label={`Sort order for ${product.name}`} type="number" min="0" step="1" defaultValue={product.sort_order} disabled={!canWrite} className="inventory-input mt-2 min-h-9 w-20 text-center text-xs tnums" />
      </td>
      <td className="px-2 py-3">
        <div className="space-y-2 text-xs font-bold text-ink-muted">
          <label className="flex items-center gap-2"><input type="checkbox" name="track_stock" form={formId} defaultChecked={product.track_stock} disabled={!canWrite} className="h-4 w-4 accent-primary" /> Track stock</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="is_active" form={formId} defaultChecked={product.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" /> Show in POS</label>
        </div>
      </td>
      <td className="px-2 py-3 text-right">
        <button type="submit" form={formId} disabled={!canWrite} className="rounded-btn bg-primary px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save product</button>
      </td>
    </tr>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-7 text-center">
      <p className="text-sm font-extrabold text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

function CatalogProfileMissing() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p>
        <h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/pos" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Open POS</Link>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
