import type { StockMovementType } from "@/lib/inventory";

export type InventoryProductReadModel = {
  id: string;
  storeId: string;
  categoryId: string | null;
  supplierId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  pricingMode: "fixed" | "per_kg";
  price: number;
  costPrice: number | null;
  unit: string;
  minStock: number;
  trackStock: boolean;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  categoryName: string;
  supplierName: string;
  branchName: string;
};

export type InventoryStockSnapshot = {
  id: string;
  storeId: string;
  productId: string;
  branchName: string;
  productName: string;
  categoryName: string;
  supplierName: string;
  unit: string;
  onHand: number;
  minimum: number;
  status: "in_stock" | "low" | "out";
  inventoryValue: number;
};

export type InventoryMovementReadModel = {
  id: string;
  storeId: string;
  productId: string;
  productName: string;
  branchName: string;
  type: StockMovementType;
  quantity: number;
  unit: string;
  unitCost: number | null;
  reason: string | null;
  refOrderId: string | null;
  createdAt: string;
};

export type InventoryVarianceReadModel = {
  id: string;
  storeId: string;
  productId: string;
  inventoryItemId?: string | null;
  productName: string;
  unit: string;
  countDate: string;
  expected: number;
  counted: number | null;
  variance: number | null;
  status: "pending" | "balanced" | "short" | "over";
  updatedAt: string | null;
};
