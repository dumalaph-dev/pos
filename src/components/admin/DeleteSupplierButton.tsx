"use client";

import { useFormStatus } from "react-dom";
import { deleteSupplier } from "@/app/admin/suppliers/actions";

type DeleteSupplierButtonProps = {
  supplierId: string;
  supplierName: string;
  variant?: "compact" | "full";
};

function DeleteSubmitButton({ supplierName, variant }: { supplierName: string; variant: "compact" | "full" }) {
  const { pending } = useFormStatus();
  const className = variant === "full"
    ? "w-full rounded-btn border border-danger/30 bg-danger-soft px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-danger transition hover:border-danger/50 hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded-btn border border-danger/25 px-3 py-2 text-[10px] font-extrabold text-danger transition hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50";

  return <button type="submit" disabled={pending} className={className} aria-label={`Delete supplier ${supplierName}`}>
    {pending ? "Deleting..." : "Delete supplier"}
  </button>;
}

export function DeleteSupplierButton({ supplierId, supplierName, variant = "full" }: DeleteSupplierButtonProps) {
  return <form
    action={deleteSupplier}
    onSubmit={(event) => {
      const confirmed = window.confirm(`Delete ${supplierName}? Products assigned to this supplier will remain, but their supplier field will be cleared.`);
      if (!confirmed) event.preventDefault();
    }}
  >
    <input type="hidden" name="supplier_id" value={supplierId} />
    <DeleteSubmitButton supplierName={supplierName} variant={variant} />
  </form>;
}
