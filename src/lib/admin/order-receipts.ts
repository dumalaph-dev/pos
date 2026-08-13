export type OrderStatus = "completed" | "voided" | "refunded";
export type PaymentMethod = "cash" | "gcash" | "maya" | "card";

/**
 * Canonical, read-only order detail data shared by every admin receipt entry
 * point. Keep this model independent from the page that originally fetched it
 * so a cached receipt can be rendered by another admin surface.
 */
export type OrderReceiptData = {
  order: {
    id: string;
    order_no: string;
    status: OrderStatus;
    subtotal: number;
    discount_amount: number;
    discount_ref: string | null;
    vatable_sale: number;
    vat_amount: number;
    vat_exempt_sale: number;
    total: number;
    payment_method: PaymentMethod;
    payment_ref: string | null;
    amount_tendered: number | null;
    change_due: number | null;
    note: string | null;
    created_at: string;
    created_at_device: string;
  };
  items: Array<{
    order_id: string;
    product_id: string | null;
    name_snapshot: string;
    qty: number;
    weight_kg: number | null;
    unit: string;
    line_total: number;
  }>;
  branch: {
    name: string;
    address: string | null;
    tin: string | null;
    vatRegistered: boolean;
    vatRate: number;
  };
  cashierName: string;
  returnTo: string;
  canManage: boolean;
  canReprint: boolean;
  reversal: { status: OrderStatus; order_no: string; created_at: string } | null;
};
