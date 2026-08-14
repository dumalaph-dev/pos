"use client";

import type { ReactNode } from "react";
import { ProductEditDialog } from "@/components/admin/ProductEditDialog";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";
import type { ProductFieldsRecord } from "@/components/admin/ProductFields";

type BranchRecord = { id: string; name: string; is_active: boolean };
type CategoryRecord = { id: string; store_id: string; name: string };
type SupplierRecord = { id: string; name: string; is_active: boolean };
type ProductRecord = ProductFieldsRecord & { is_active: boolean; track_stock: boolean };

export function ProductEditDialogController({
  children,
  products,
  branches,
  categories,
  suppliers,
  canWrite,
  initialProductId,
}: {
  children: ReactNode;
  products: ProductRecord[];
  branches: BranchRecord[];
  categories: CategoryRecord[];
  suppliers: SupplierRecord[];
  canWrite: boolean;
  initialProductId: string | null;
}) {
  return <UrlLocalDialogController
    className="product-dialog-controller"
    records={products}
    initialId={initialProductId}
    queryKey="edit"
    triggerSelector="[data-product-trigger]"
    readTriggerId={(trigger) => trigger.dataset.productTrigger ?? null}
    getRecordId={(product) => product.id ?? ""}
    performanceSurface="products"
    renderDialog={(product, onClose) => <ProductEditDialog
      key={product.id}
      product={product}
      branches={branches}
      categories={categories}
      suppliers={suppliers}
      canWrite={canWrite}
      initialOpen
      onClose={onClose}
    />}
  >{children}</UrlLocalDialogController>;
}

