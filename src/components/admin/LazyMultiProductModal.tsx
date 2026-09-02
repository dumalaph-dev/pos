"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import type { MultiProductModalProps } from "@/components/admin/MultiProductModal";

const MultiProductModal = dynamic(
  () => import("@/components/admin/MultiProductModal").then((module) => module.MultiProductModal),
  { loading: () => <span className="products-secondary-button" role="status">Loading starter catalog…</span> },
);

export function LazyMultiProductModal(props: MultiProductModalProps) {
  const [open, setOpen] = useState(false);
  const selectedStoreId = props.storeId || props.branches[0]?.id || "";

  if (!open) {
    return <button type="button" className={props.triggerClassName ?? "products-secondary-button"} onClick={() => setOpen(true)} disabled={!props.canWrite || !selectedStoreId}>
      <AdminIcon name="box" size={15} />
      {props.triggerLabel ?? "Starter catalog"}
    </button>;
  }

  return <MultiProductModal {...props} storeId={selectedStoreId} initialOpen hideTrigger onClose={() => setOpen(false)} />;
}
