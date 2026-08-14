import type { Centavos } from "@/lib/money";

export type PosProduct = {
  id: string;
  name: string;
  pricing_mode: "fixed" | "per_kg";
  price: Centavos;
  unit: string;
  category_id: string | null;
  image_url?: string | null;
  track_stock?: boolean;
  min_stock?: number | null;
};

export type CartLine = {
  key: string;
  product: PosProduct;
  qty: number;
  weightKg: number | null;
  lineTotal: Centavos;
};

export type DiscountType = "none" | "senior" | "pwd" | "custom";

export type DiscountState = {
  type: DiscountType;
  pct: number;
  name: string;
  id: string;
  approval_id?: string | null;
};

export const NO_DISCOUNT: DiscountState = { type: "none", pct: 0, name: "", id: "" };

export type RuntimePaymentMethod = "cash" | "gcash" | "maya" | "card";

export type PaymentPreview = {
  method: RuntimePaymentMethod;
  tendered: Centavos | null;
  changeDue: Centavos | null;
};

export type ParkedOrder = {
  at: number;
  lines: CartLine[];
  note: string;
  discount: DiscountState;
};
