"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type SVGProps } from "react";
import { getPosPalette, POS_PALETTE_OPTIONS, type PosPaletteId } from "@/lib/pos-palette";
import { getPosTheme, POS_THEME_OPTIONS, type PosThemeId } from "@/lib/pos-theme";

type DemoProduct = {
  id: string;
  name: string;
  pricing_mode: "fixed" | "per_kg";
  price: number;
  unit: string;
  category_id: string;
  image_url: string;
};

type CartLine = { product: DemoProduct; qty: number };
type PaymentMethod = "cash" | "card" | "gcash";

/* These are the same fallback categories and products used by the admin POS
   preview. The landing mockup should demonstrate the product people will see
   after they sign in, not a second invented catalog. */
const DEMO_CATEGORIES = [
  { id: "all", name: "All Items", icon: "grid" },
  { id: "preview-lechon", name: "Lechon", icon: "pig" },
  { id: "preview-rice", name: "Rice & Sides", icon: "rice" },
  { id: "preview-drinks", name: "Drinks", icon: "drink" },
  { id: "preview-extras", name: "Sauces & Extras", icon: "sauce" },
];

const DEMO_PRODUCTS: DemoProduct[] = [
  { id: "preview-regular", name: "Lechon Regular", pricing_mode: "per_kg", price: 650, unit: "kg", category_id: "preview-lechon", image_url: "/food/whole-lechon-small.png" },
  { id: "preview-belly", name: "Lechon Belly", pricing_mode: "per_kg", price: 700, unit: "kg", category_id: "preview-lechon", image_url: "/food/lechon-belly-one.png" },
  { id: "preview-paa", name: "Lechon Paa", pricing_mode: "fixed", price: 350, unit: "pc", category_id: "preview-lechon", image_url: "/food/lechon-kawali.png" },
  { id: "preview-paksiw", name: "Lechon Paksiw", pricing_mode: "fixed", price: 180, unit: "bowl", category_id: "preview-lechon", image_url: "/food/lechon-paksiw.png" },
  { id: "preview-sisig", name: "Lechon Sisig", pricing_mode: "fixed", price: 220, unit: "bowl", category_id: "preview-lechon", image_url: "/food/lechon-kawali.png" },
  { id: "preview-garlic-rice", name: "Garlic Rice", pricing_mode: "fixed", price: 40, unit: "cup", category_id: "preview-rice", image_url: "/food/rice-sides.png" },
  { id: "preview-java-rice", name: "Java Rice", pricing_mode: "fixed", price: 45, unit: "cup", category_id: "preview-rice", image_url: "/food/java-rice.png" },
  { id: "preview-plain-rice", name: "Plain Rice", pricing_mode: "fixed", price: 35, unit: "cup", category_id: "preview-rice", image_url: "/food/rice-sides.png" },
  { id: "preview-iced-tea", name: "Iced Tea", pricing_mode: "fixed", price: 50, unit: "glass", category_id: "preview-drinks", image_url: "/food/rice-sides.png" },
  { id: "preview-softdrinks", name: "Softdrinks (Can)", pricing_mode: "fixed", price: 60, unit: "can", category_id: "preview-drinks", image_url: "/food/rice-sides.png" },
  { id: "preview-sauce", name: "Lechon Sauce", pricing_mode: "fixed", price: 25, unit: "cup", category_id: "preview-extras", image_url: "/food/mang-tomas.png" },
  { id: "preview-gravy", name: "Extra Gravy", pricing_mode: "fixed", price: 20, unit: "cup", category_id: "preview-extras", image_url: "/food/mang-tomas.png" },
];

const DEMO_PALETTE_OPTIONS = POS_PALETTE_OPTIONS.filter((option) => option.id !== "custom");
const PESO_FORMATTER = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatPeso(value: number) {
  return PESO_FORMATTER.format(value);
}

function parsePeso(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function iconPath(name: string): ReactNode {
  switch (name) {
    case "search": return <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>;
    case "chevron": return <path d="m8 10 4 4 4-4" />;
    case "grid": return <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>;
    case "list": return <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>;
    case "scanner": return <><path d="M5 7V5h3M16 5h3v2M5 17v2h3M19 17v2h-3" /><path d="M8 12h8M10 9v6M14 9v6" /></>;
    case "plus": return <path d="M12 5v14M5 12h14" />;
    case "more": return <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>;
    case "trash": return <><path d="M4 7h16M10 11v5M14 11v5" /><path d="M6.5 7 8 20h8l1.5-13M9 7V4h6v3" /></>;
    case "person": return <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.5 3-5.3 7-5.3s6.2 1.8 7 5.3" /></>;
    case "cash": return <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9h.01M18 15h.01" /></>;
    case "card": return <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 14h3" /></>;
    case "gcash": return <><circle cx="12" cy="12" r="9" /><path d="M8 12h5M12 9l3 3-3 3" /></>;
    case "settings": return <><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" /></>;
    case "note": return <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>;
    case "check": return <path d="m6 12 4 4 8-9" />;
    case "pig": return <><path d="M5 13c0-4 3-7 8-7 2 0 4 .7 5.3 2.1 1.4 0 2.7.6 3.7 1.9l-1.5 1.4.3 2.6-2 .2c-.8 2.2-2.8 3.8-5.8 3.8H9l-2 2H5l1-3.2c-.7-1-1-2.3-1-3.8Z" /><circle cx="17" cy="10" r=".7" /><path d="M19 14h2M8 12h.01" /></>;
    case "drink": return <><path d="M8 5h8l-1 15H9L8 5Z" /><path d="M9 9h6M10 2h4M10 2v3" /></>;
    case "rice": return <><path d="M5 11h14c-.4 5.2-3 8-7 8s-6.6-2.8-7-8Z" /><path d="M8 8c.6-1.8 1.9-3 4-3s3.4 1.2 4 3M4 11h16" /></>;
    case "sauce": return <><path d="M10 4h4v3h-4zM9 7h6l1 13H8L9 7Z" /><path d="M9 12h6" /></>;
    default: return <circle cx="12" cy="12" r="8" />;
  }
}

function MiniIcon({ name, size = 16 }: { name: string; size?: number }) {
  const props: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  return <svg {...props}>{iconPath(name)}</svg>;
}

function initialCart(): CartLine[] {
  const quantities = [1, 2, 2, 1];
  return DEMO_PRODUCTS.slice(0, 4).map((product, index) => ({ product, qty: quantities[index] ?? 1 }));
}

function ThemeOption({
  theme,
  selected,
  onSelect,
}: {
  theme: (typeof POS_THEME_OPTIONS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={`pos-style-option ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <span className={`pos-style-thumbnail pos-style-thumbnail--${theme.id}`} aria-hidden="true">
        <i className="pos-style-thumbnail__top" />
        <i className="pos-style-thumbnail__rail" />
        <i className="pos-style-thumbnail__card" />
        <i className="pos-style-thumbnail__order" />
        <i className="pos-style-thumbnail__accent" />
      </span>
      <span>
        <strong>{theme.label}</strong>
        <small>{theme.description}</small>
        <em>{theme.mood}</em>
      </span>
      <span className="pos-style-radio" />
    </button>
  );
}

export default function LandingPosPlayground() {
  const [selectedThemeId, setSelectedThemeId] = useState<PosThemeId>("modern");
  const [selectedPaletteId, setSelectedPaletteId] = useState<PosPaletteId>("green");
  const [customColor, setCustomColor] = useState("#c39756");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [orderType, setOrderType] = useState("Dine In");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountRate, setDiscountRate] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saleComplete, setSaleComplete] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>(initialCart);
  const themeModalCloseRef = useRef<HTMLButtonElement>(null);
  const themeModalOpenerRef = useRef<HTMLButtonElement>(null);

  const selectedTheme = useMemo(() => getPosTheme(selectedThemeId), [selectedThemeId]);
  const selectedPalette = useMemo(() => getPosPalette(selectedPaletteId, customColor), [customColor, selectedPaletteId]);
  const previewStyle = {
    ...selectedTheme.variables,
    "--pos-theme-highlight": selectedPalette.primary,
    "--pos-theme-highlight-soft": selectedPalette.tint,
    "--pos-theme-primary-soft": selectedPalette.soft,
    "--preview-accent": selectedPalette.primary,
    "--preview-accent-hover": selectedPalette.hover,
    "--preview-accent-deep": selectedPalette.deep,
    "--preview-accent-soft": selectedPalette.soft,
    "--preview-accent-tint": selectedPalette.tint,
    "--preview-accent-glow": selectedPalette.glow,
    "--preview-accent-contrast": selectedPalette.contrast,
    "--preview-accent-gradient": selectedPalette.gradient,
  } as CSSProperties;

  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return DEMO_PRODUCTS.filter((product) => {
      const matchesCategory = activeCategory === "all" || product.category_id === activeCategory;
      const matchesSearch = !normalizedSearch || product.name.toLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const discountAmount = Math.round(subtotal * discountRate * 100) / 100;
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = Math.round(taxable * 0.12 * 100) / 100;
  const total = taxable + taxAmount;
  const tendered = amountTendered ? parsePeso(amountTendered) : Math.ceil(total / 100) * 100;
  const changeDue = Math.max(0, tendered - total);
  const canComplete = Boolean(cart.length) && tendered >= total;

  useEffect(() => {
    if (!isThemeModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => themeModalCloseRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsThemeModalOpen(false);
        window.setTimeout(() => themeModalOpenerRef.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isThemeModalOpen]);

  function updateCart(productId: string, delta: number) {
    setSaleComplete(false);
    setCart((current) => current
      .map((line) => line.product.id === productId ? { ...line, qty: line.qty + delta } : line)
      .filter((line) => line.qty > 0));
  }

  function addProduct(product: DemoProduct) {
    setSaleComplete(false);
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { product, qty: 1 }];
    });
  }

  function clearCart() {
    setCart([]);
    setSaleComplete(false);
  }

  function completeSale() {
    if (canComplete) setSaleComplete(true);
  }

  function openThemeModal() {
    setIsThemeModalOpen(true);
  }

  function closeThemeModal() {
    setIsThemeModalOpen(false);
    window.setTimeout(() => themeModalOpenerRef.current?.focus(), 0);
  }

  return (
    <div className="lp-tablet-playground">
      <div className="lp-tablet-playground__toolbar">
        <div className="lp-tablet-playground__toolbar-copy">
          <span className="lp-tablet-playground__eyebrow">Live tablet preview</span>
          <strong>{selectedTheme.label}</strong>
          <span>Same cashier layout as the admin POS preview</span>
        </div>
        <button ref={themeModalOpenerRef} type="button" className="lp-tablet-playground__theme-button" onClick={openThemeModal} aria-haspopup="dialog" aria-expanded={isThemeModalOpen}>
          <span className="lp-tablet-playground__theme-swatch" style={{ backgroundColor: selectedPalette.primary }} aria-hidden="true" />
          Customize theme <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="lp-tablet-stage">
        <div className="lp-tablet-shell">
          <span className="lp-tablet-shell__camera" aria-hidden="true" />
          <div className="lp-tablet-shell__screen">
            <div className={`pos-preview-window pos-preview-window--tablet pos-preview-window--${selectedThemeId}`} style={previewStyle}>
              <header className="pos-preview-topbar" title="Main Branch">
                <span className="pos-preview-brand-mark" aria-hidden="true">D</span>
                <div className="pos-preview-brand-copy"><strong>Dumala POS</strong><span>Branch 01 <MiniIcon name="chevron" size={11} /></span></div>
                <div className="pos-preview-topbar__status"><span><i /> Online</span><span>Tuesday · 10:24 AM</span><span><MiniIcon name="person" size={14} /> Cashier: Alex</span></div>
              </header>

              <div className="pos-preview-body">
                <aside className="pos-preview-categories" aria-label="Product categories">
                  <div className="pos-preview-category-list">
                    {DEMO_CATEGORIES.map((category) => <button type="button" key={category.id} className={activeCategory === category.id ? "is-active" : ""} onClick={() => setActiveCategory(category.id)}><MiniIcon name={category.icon} size={15} /><span>{category.name}</span></button>)}
                  </div>
                  <button type="button" className="pos-preview-clear-cart" onClick={clearCart}><MiniIcon name="trash" size={14} /> Clear Cart</button>
                </aside>

                <section className="pos-preview-catalog" aria-label="POS product catalog">
                  <div className="pos-preview-catalog-toolbar">
                    <label className="pos-preview-search"><MiniIcon name="search" size={17} /><span className="sr-only">Search item by name or SKU</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item by name or SKU..." /></label>
                    <button type="button" className="pos-preview-scan" onClick={() => setSearch("Scan barcode...")}><MiniIcon name="scanner" size={16} /> <span>Scan Barcode</span></button>
                    <div className="pos-preview-view-toggle"><button type="button" className={viewMode === "grid" ? "is-active" : ""} aria-label="Grid view" onClick={() => setViewMode("grid")}><MiniIcon name="grid" size={16} /></button><button type="button" className={viewMode === "list" ? "is-active" : ""} aria-label="List view" onClick={() => setViewMode("list")}><MiniIcon name="list" size={16} /></button></div>
                  </div>
                  {visibleProducts.length ? <div className={`pos-preview-product-grid ${viewMode === "list" ? "is-list" : ""}`}>
                    {visibleProducts.map((product) => <button type="button" className="pos-preview-product" key={product.id} onClick={() => addProduct(product)} aria-label={`Add ${product.name} to order`}>
                      <span className="pos-preview-product-image"><Image src={product.image_url} alt="" fill sizes="(max-width: 1100px) 16vw, 120px" /></span>
                      <span className="pos-preview-product-copy"><strong>{product.name}</strong><span>{formatPeso(product.price)}{product.pricing_mode === "per_kg" ? " / kg" : ""}</span></span>
                    </button>)}
                  </div> : <div className="pos-preview-empty"><MiniIcon name="search" size={22} /><strong>No products found</strong><p>Try another search or category.</p></div>}
                  <div className="pos-preview-pagination" aria-hidden="true"><i className="is-active" /><i /><i /></div>
                </section>

                <aside className="pos-preview-order" aria-label="Current order">
                  <div className="pos-preview-order-head"><h3>Current Order</h3><div className="pos-preview-order-actions"><select aria-label="Order type" value={orderType} onChange={(event) => setOrderType(event.target.value)}><option>Dine In</option><option>Takeout</option><option>Delivery</option></select><button type="button" className="pos-preview-more" aria-label="More order actions" aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)}><MiniIcon name="more" size={16} /></button>{moreOpen ? <div className="pos-preview-more-menu"><button type="button" onClick={() => { clearCart(); setMoreOpen(false); }}><MiniIcon name="trash" size={13} /> Clear order</button><button type="button" onClick={() => { setNoteOpen(true); setMoreOpen(false); }}><MiniIcon name="note" size={13} /> Add note</button></div> : null}</div></div>
                  <div className="pos-preview-lines">
                    {cart.length ? cart.map((line) => <div className="pos-preview-order-line" key={line.product.id}>
                      <div className="pos-preview-line-copy"><strong>{line.product.name}</strong><span>{line.product.pricing_mode === "per_kg" ? `${line.qty} kg` : `x ${line.qty}`}</span></div>
                      <div className="pos-preview-line-controls"><button type="button" aria-label={`Decrease ${line.product.name}`} onClick={() => updateCart(line.product.id, -1)}>-</button><span>{line.qty}</span><button type="button" aria-label={`Increase ${line.product.name}`} onClick={() => updateCart(line.product.id, 1)}>+</button></div>
                      <strong className="pos-preview-line-total">{formatPeso(line.product.price * line.qty)}</strong><button type="button" className="pos-preview-line-remove" aria-label={`Remove ${line.product.name}`} onClick={() => updateCart(line.product.id, -line.qty)}><MiniIcon name="trash" size={12} /></button>
                    </div>) : <div className="pos-preview-order-empty"><MiniIcon name="search" size={22} /><strong>Your order is empty</strong><span>Select an item to preview the checkout.</span></div>}
                  </div>
                  <div className="pos-preview-note-area">{noteOpen ? <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add note or instructions..." autoFocus /> : <button type="button" onClick={() => setNoteOpen(true)}><MiniIcon name="plus" size={14} /> {note ? "Edit Note" : "Add Note or Instructions"}</button>}</div>
                  <div className="pos-preview-summary">
                    <div><span>Subtotal</span><strong>{formatPeso(subtotal)}</strong></div>
                    <div className="pos-preview-summary-discount"><span>Discount <button type="button" aria-label="Choose discount" onClick={() => setDiscountOpen((current) => !current)}><MiniIcon name="settings" size={12} /></button></span><strong>{discountAmount ? `-${formatPeso(discountAmount)}` : formatPeso(0)}</strong>{discountOpen ? <div className="pos-discount-menu"><button type="button" onClick={() => { setDiscountRate(0); setDiscountOpen(false); }}>No discount</button><button type="button" onClick={() => { setDiscountRate(0.05); setDiscountOpen(false); }}>5% preview discount</button><button type="button" onClick={() => { setDiscountRate(0.1); setDiscountOpen(false); }}>10% preview discount</button></div> : null}</div>
                    <div><span>Tax (VAT 12%)</span><strong>{formatPeso(taxAmount)}</strong></div>
                    <div className="pos-preview-total"><span>TOTAL</span><strong>{formatPeso(total)}</strong></div>
                  </div>
                  <div className="pos-preview-payment"><p>PAYMENT</p><div className="pos-preview-payment-options">{(["cash", "card", "gcash"] as const).map((method) => <button type="button" key={method} className={paymentMethod === method ? "is-active" : ""} onClick={() => setPaymentMethod(method)}><MiniIcon name={method} size={14} /> {method === "gcash" ? "GCash" : method[0].toUpperCase() + method.slice(1)}</button>)}</div></div>
                  <label className="pos-preview-tendered"><span>Amount Tendered</span><span><b>₱</b><input value={amountTendered || tendered.toFixed(2)} onChange={(event) => setAmountTendered(event.target.value)} inputMode="decimal" aria-label="Amount tendered" /></span></label>
                  <div className="pos-preview-change"><span>Change</span><strong>{formatPeso(changeDue)}</strong></div>
                  <button type="button" className="pos-preview-complete" disabled={!canComplete} onClick={completeSale}><MiniIcon name="check" size={16} /> {saleComplete ? "Sale Complete" : "Complete Sale"}</button>
                </aside>
              </div>
            </div>
          </div>
          <span className="lp-tablet-shell__home" aria-hidden="true" />
        </div>
        <p className="lp-tablet-stage__caption"><span aria-hidden="true">✦</span> The same cashier workspace, shown inside a tablet.</p>
      </div>

      {isThemeModalOpen ? (
        <div className="lp-theme-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeThemeModal(); }}>
          <section className="lp-theme-modal" role="dialog" aria-modal="true" aria-labelledby="lp-theme-modal-title" style={{ "--primary": selectedPalette.primary } as CSSProperties}>
            <header className="lp-theme-modal__header">
              <div>
                <span className="lp-tablet-playground__eyebrow">POS Appearance</span>
                <h3 id="lp-theme-modal-title">Customize your theme</h3>
                <p>These are the same interface themes used by the POS Preview in the owner workspace.</p>
              </div>
              <button ref={themeModalCloseRef} type="button" className="lp-theme-modal__close" onClick={closeThemeModal} aria-label="Close theme customization">×</button>
            </header>
            <div className="lp-theme-modal__body">
              <div className="lp-theme-modal__section-heading"><div><span>01</span><strong>Interface theme</strong></div><small>{POS_THEME_OPTIONS.length} styles</small></div>
              <div className="pos-style-options lp-landing-pos-style-options" role="radiogroup" aria-label="POS interface theme">
                {POS_THEME_OPTIONS.map((theme) => <ThemeOption key={theme.id} theme={theme} selected={selectedThemeId === theme.id} onSelect={() => setSelectedThemeId(theme.id)} />)}
              </div>
              <div className="lp-theme-modal__section-heading lp-theme-modal__section-heading--accent"><div><span>02</span><strong>Color palette</strong></div><small>Same POS accent system</small></div>
              <div className="pos-palette-options lp-landing-pos-palette-options" role="radiogroup" aria-label="POS color palette">
                {DEMO_PALETTE_OPTIONS.map((option) => {
                  const palette = getPosPalette(option.id, customColor);
                  return <button type="button" role="radio" aria-checked={selectedPaletteId === option.id} title={palette.description} key={option.id} className={`pos-palette-option ${selectedPaletteId === option.id ? "is-selected" : ""}`} style={{ "--palette-option-accent": palette.primary } as CSSProperties} aria-label={`Use ${palette.label} palette`} onClick={() => setSelectedPaletteId(option.id)}><span style={{ background: palette.gradient }} />{selectedPaletteId === option.id ? <b style={{ color: palette.contrast, background: palette.primary }}><MiniIcon name="check" size={11} /></b> : null}</button>;
                })}
                <label className={`lp-theme-modal__custom-color${selectedPaletteId === "custom" ? " is-selected" : ""}`}><span>Custom</span><input type="color" value={customColor} onChange={(event) => { setCustomColor(event.target.value); setSelectedPaletteId("custom"); }} aria-label="Choose a custom POS accent color" /></label>
              </div>
            </div>
            <footer className="lp-theme-modal__footer"><span><i aria-hidden="true" /> Preview updates instantly</span><button type="button" onClick={closeThemeModal}>Done</button></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
